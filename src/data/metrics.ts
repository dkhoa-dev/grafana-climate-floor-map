import { Level, Limits } from '../types';

export const normalizeName = (name: string) => name.toLowerCase().replace(/[\s_\-.]/g, '');

interface WellKnown {
  name: string;
  /** Grafana unit id. */
  unit: string;
  decimals: number;
  /** Used only when neither the data nor the field config gives the metric any limit. */
  limits?: Limits;
}

/**
 * Sensible defaults for common indoor-climate metrics, so a plain temperature/humidity query works
 * without any configuration. Every value here can be replaced in the field config.
 */
export const WELL_KNOWN: Record<string, WellKnown> = {
  temperature: { name: 'Temperature', unit: 'celsius', decimals: 1, limits: { min: 18, max: 27 } },
  humidity: { name: 'Humidity', unit: 'percent', decimals: 1, limits: { min: 30, max: 60 } },
  co2: { name: 'CO₂', unit: 'ppm', decimals: 0, limits: { max: 1000 } },
  pm25: { name: 'PM2.5', unit: 'conµgm3', decimals: 0, limits: { max: 25 } },
  pm10: { name: 'PM10', unit: 'conµgm3', decimals: 0, limits: { max: 50 } },
};

// Short names that mean a well-known metric.
const ALIASES: Record<string, string> = { t: 'temperature', rh: 'humidity' };

/** The key a field or label name is known by: normalised, with short aliases resolved. */
export function metricKey(name: string): string {
  const n = normalizeName(name);
  return ALIASES[n] ?? n;
}

/** "air_quality" becomes "Air quality"; well-known metrics keep their proper names. */
export function metricName(rawName: string): string {
  const known = WELL_KNOWN[metricKey(rawName)];
  if (known) {
    return known.name;
  }
  const words = rawName.replace(/[_\-.]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : rawName;
}

export const hasLimits = (l: Limits | undefined): l is Limits =>
  l !== undefined && (l.min !== undefined || l.max !== undefined);

const RANK: Record<Level, number> = { ok: 0, warning: 1, alarm: 2 };

export const worst = (levels: Level[]): Level | undefined =>
  levels.reduce<Level | undefined>((w, l) => (w === undefined || RANK[l] > RANK[w] ? l : w), undefined);

/**
 * Where a value sits relative to its limits: outside is an alarm, inside but within the margin is a
 * warning. With both limits the margin is a share of the band; with one limit, a share of that limit.
 */
export function levelOf(value: number, limits: Limits, marginPercent: number): Level {
  const { min, max } = limits;
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    return 'alarm';
  }
  const pct = Math.max(0, marginPercent) / 100;
  const margin =
    min !== undefined && max !== undefined ? (max - min) * pct : Math.abs((max ?? min ?? 0) as number) * pct;
  if ((min !== undefined && value < min + margin) || (max !== undefined && value > max - margin)) {
    return 'warning';
  }
  return 'ok';
}

/**
 * Position of a value against its limits for colouring: 0 at min, 1 at max, outside 0-1 when out
 * of limits. With only a max, 0 is zero; with only a min, anything at or above it sits mid-band.
 */
export function bandPosition(value: number, limits: Limits): number | undefined {
  const { min, max } = limits;
  if (min !== undefined && max !== undefined) {
    return max === min ? 0.5 : (value - min) / (max - min);
  }
  if (max !== undefined) {
    return max === 0 ? (value > 0 ? 2 : 0.5) : value / max;
  }
  if (min !== undefined) {
    return value < min ? -1 : 0.5;
  }
  return undefined;
}

const KNOWN_ORDER = Object.keys(WELL_KNOWN);

/** Well-known metrics first, in their usual order, then the rest alphabetically. */
export function compareMetricKeys(a: string, b: string): number {
  const ia = KNOWN_ORDER.indexOf(a);
  const ib = KNOWN_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) {
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  }
  return a.localeCompare(b);
}
