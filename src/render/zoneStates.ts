import {
  FieldColorModeId,
  FieldConfig,
  FieldType,
  getActiveThreshold,
  getFieldColorModeForField,
  GrafanaTheme2,
  ThresholdsConfig,
  ThresholdsMode,
} from '@grafana/data';
import { zoneIndex, ZoneIndex } from '../climate/statusIndex';
import { loadsExternalResource } from '../plan/externalRefs';
import { FloorMapOptions, SensorReading } from '../types';
import { formatMetric } from './format';

/**
 * - unbound: no sensor chosen for the zone; the plan keeps its own look.
 * - offline: a sensor is bound but absent from the current data.
 * - stale: the newest reading is older than the staleness threshold.
 * - live: a current reading.
 */
export type ZoneStatus = 'unbound' | 'offline' | 'stale' | 'live';

export interface ZoneState {
  zone: string;
  status: ZoneStatus;
  sensorKey?: string;
  reading?: SensorReading;
  index?: ZoneIndex;
  ageMs?: number;
}

/** What the plan should look like for one zone. Compared by value to skip unchanged zones. */
export interface ZoneVisual {
  status: ZoneStatus;
  /** Undefined keeps the plan's own fill. */
  fill?: string;
  fillOpacity?: number;
  /** Undefined keeps the plan's own text colour. */
  titleColor?: string;
  /** Undefined keeps the plan's own readout text. */
  readout?: string[];
  textHalo?: string;
  label: string;
}

export const OFFLINE_MARK = 'offline';
export const STALE_MARK = 'stale';

export function computeZoneStates(
  zones: string[],
  options: Pick<FloorMapOptions, 'bindings' | 'indexMode' | 'limits' | 'staleAfterMinutes'>,
  readings: Map<string, SensorReading>,
  now: number
): Map<string, ZoneState> {
  const states = new Map<string, ZoneState>();
  const staleMs = options.staleAfterMinutes > 0 ? options.staleAfterMinutes * 60000 : 0;
  for (const zone of zones) {
    const sensorKey = options.bindings?.[zone];
    if (!sensorKey) {
      states.set(zone, { zone, status: 'unbound' });
      continue;
    }
    const reading = readings.get(sensorKey);
    if (!reading) {
      states.set(zone, { zone, status: 'offline', sensorKey });
      continue;
    }
    const ageMs = reading.time !== undefined ? Math.max(0, now - reading.time) : undefined;
    const stale = staleMs > 0 && ageMs !== undefined && ageMs > staleMs;
    states.set(zone, {
      zone,
      status: stale ? 'stale' : 'live',
      sensorKey,
      reading,
      ageMs,
      index: zoneIndex([reading], options.indexMode, options.limits),
    });
  }
  return states;
}

export const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'blue' },
    { value: 10, color: 'green' },
    { value: 90, color: 'red' },
  ],
};

/**
 * Resolves a colour from the panel's colour options. Grafana passes unknown names through as-is, so
 * a value such as url(https://…) would make the browser fetch it; those fall back to Grafana's grey.
 */
export function paintColor(name: string, theme: GrafanaTheme2): string {
  const color = theme.visualization.getColorByName(name);
  return loadsExternalResource(color) ? theme.visualization.getColorByName('') : color;
}

/** Colour for a 0–100 index from Grafana's standard colour options. */
export function indexColor(
  index: number,
  colorMode: FloorMapOptions['colorMode'],
  config: FieldConfig,
  theme: GrafanaTheme2
): string {
  const thresholds = config.thresholds?.steps?.length ? config.thresholds : DEFAULT_THRESHOLDS;
  const threshold = getActiveThreshold(index, thresholds.steps);
  if (colorMode === 'banded') {
    return paintColor(threshold.color, theme);
  }
  const field = {
    name: 'status index',
    type: FieldType.number,
    values: [index],
    config: { ...config, min: 0, max: 100, color: config.color ?? { mode: FieldColorModeId.ContinuousBlYlRd } },
  };
  const calculate = getFieldColorModeForField(field).getCalculator(field, theme);
  // The fixed colour mode returns the configured colour name unchecked.
  return paintColor(calculate(index, index / 100, threshold), theme);
}

function readoutLines(state: ZoneState, decimals: number): string[] | undefined {
  if (state.status === 'unbound') {
    return undefined;
  }
  if (state.status === 'offline') {
    return [OFFLINE_MARK];
  }
  const reading = state.reading!;
  const lines = [
    formatMetric('temperature', reading.temperature, decimals, reading.temperatureUnit),
    formatMetric('humidity', reading.humidity, decimals, reading.humidityUnit),
  ];
  if (reading.temperature === undefined && reading.humidity === undefined && reading.statusIndex !== undefined) {
    lines.splice(0, 2, `${Math.round(state.index?.value ?? 0)} / 100`);
  }
  return state.status === 'stale' ? [STALE_MARK, ...lines] : lines;
}

function describe(state: ZoneState, readout: string[] | undefined): string {
  switch (state.status) {
    case 'unbound':
      return `${state.zone}: no sensor bound`;
    case 'offline':
      return `${state.zone}: offline, no data from ${state.sensorKey}`;
    default:
      return `${state.zone}: ${(readout ?? []).join(', ')}`;
  }
}

export function zoneVisual(
  state: ZoneState,
  options: Pick<FloorMapOptions, 'colorMode' | 'decimals' | 'fillOpacity'>,
  config: FieldConfig,
  theme: GrafanaTheme2
): ZoneVisual {
  const readout = readoutLines(state, options.decimals);
  const label = describe(state, readout);
  if (state.status === 'unbound') {
    return { status: state.status, label };
  }
  const neutral = theme.colors.border.strong;
  const indexValue = state.index?.value;
  const online = state.status === 'live' && indexValue !== undefined;
  return {
    status: state.status,
    fill: online ? indexColor(indexValue!, options.colorMode, config, theme) : neutral,
    fillOpacity: online ? options.fillOpacity : 1,
    titleColor: state.status === 'live' ? theme.colors.text.primary : theme.colors.error.text,
    readout,
    textHalo: theme.colors.background.primary,
    label,
  };
}

export function sameVisual(a: ZoneVisual | undefined, b: ZoneVisual): boolean {
  return (
    !!a &&
    a.status === b.status &&
    a.fill === b.fill &&
    a.fillOpacity === b.fillOpacity &&
    a.titleColor === b.titleColor &&
    a.textHalo === b.textHalo &&
    a.label === b.label &&
    (a.readout ?? []).join('\n') === (b.readout ?? []).join('\n') &&
    (a.readout === undefined) === (b.readout === undefined)
  );
}
