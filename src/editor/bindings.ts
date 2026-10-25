import { ComboboxOption } from '@grafana/ui';
import { SensorReading, ZoneBindings } from '../types';

export const NOT_IN_DATA = 'not in current data';

export interface SensorChoice {
  key: string;
  label?: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Sensors sorted by label, then key, so the list keeps its order when new rows arrive. */
export function sortedSensors(readings: Map<string, SensorReading>): SensorChoice[] {
  return Array.from(readings.values(), (r) => ({ key: r.key, label: r.label })).sort(
    (a, b) => collator.compare(a.label ?? a.key, b.label ?? b.key) || collator.compare(a.key, b.key)
  );
}

/** Picker options. The value is always the sensor key; the label is shown when the data has one. */
export function sensorOptions(sensors: SensorChoice[], current?: string): Array<ComboboxOption<string>> {
  const options: Array<ComboboxOption<string>> = sensors.map((s) => ({
    value: s.key,
    label: s.label ?? s.key,
    description: s.label ? s.key : undefined,
  }));
  if (current && !sensors.some((s) => s.key === current)) {
    // Keep a saved binding visible even when its sensor is missing from the current data.
    options.unshift({ value: current, label: `${current} (${NOT_IN_DATA})` });
  }
  return options;
}

/** Sets or clears one zone's sensor and returns a new bindings object. */
export function setBinding(bindings: ZoneBindings, zone: string, sensorKey: string | null): ZoneBindings {
  const next = { ...bindings };
  if (sensorKey) {
    next[zone] = sensorKey;
  } else {
    delete next[zone];
  }
  return next;
}

/** Drops bindings for zones that are no longer in the plan. */
export function pruneBindings(bindings: ZoneBindings, zones: string[]): ZoneBindings {
  const keep = new Set(zones);
  return Object.fromEntries(Object.entries(bindings).filter(([zone]) => keep.has(zone)));
}

/**
 * Binds each unbound zone to the sensor whose label equals the zone name, ignoring case and
 * surrounding spaces. Existing bindings are kept.
 */
export function bindByMatchingNames(bindings: ZoneBindings, zones: string[], sensors: SensorChoice[]): ZoneBindings {
  const byLabel = new Map<string, string>();
  for (const sensor of sensors) {
    const name = sensor.label?.trim().toLowerCase();
    if (name && !byLabel.has(name)) {
      byLabel.set(name, sensor.key);
    }
  }
  const next = { ...bindings };
  for (const zone of zones) {
    const match = byLabel.get(zone.trim().toLowerCase());
    if (!next[zone] && match) {
      next[zone] = match;
    }
  }
  return next;
}
