import { DefaultLimits, IndexMode, LimitPair, MetricId, SensorReading } from '../types';

/**
 * Default comfort bands, used when the data carries no limits of its own.
 * Temperature: 20–26 °C, the EN 16798-1 Category II design range across heating and cooling seasons.
 * Humidity: 30–60 %RH, after the US EPA advice to keep indoor humidity below 60 %, ideally 30–50 %.
 * Sources are in docs/design-log.md.
 */
export const FALLBACK_LIMITS: DefaultLimits = {
  temperature: { low: 20, high: 26 },
  humidity: { low: 30, high: 60 },
};

export type LimitSource = 'data' | 'default' | 'default-invalid-data';

export interface ResolvedLimits extends LimitPair {
  source: LimitSource;
}

export interface MetricScore {
  metric: MetricId;
  value: number;
  limits: ResolvedLimits;
  /** 0–100 in the panel's index mode. */
  score: number;
}

export interface ZoneIndex {
  /** 0–100, or undefined when nothing was usable. */
  value?: number;
  /** Per-metric scores, shown in the tooltip so a cancelled-out mean is visible. */
  metrics: MetricScore[];
  /** True when the index came ready-made from the data. */
  precomputed: boolean;
  /** True when a ready-made index lay outside 0–100 and was clamped. */
  clamped: boolean;
}

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const isValidPair = (low: number | undefined, high: number | undefined): boolean =>
  low !== undefined && high !== undefined && Number.isFinite(low) && Number.isFinite(high) && low < high;

/** Limits from the reading when both bounds are valid, otherwise the panel defaults. */
export function resolveLimits(reading: SensorReading, metric: MetricId, defaults: DefaultLimits): ResolvedLimits {
  const low = metric === 'temperature' ? reading.temperatureLow : reading.humidityLow;
  const high = metric === 'temperature' ? reading.temperatureHigh : reading.humidityHigh;
  if (isValidPair(low, high)) {
    return { low: low!, high: high!, source: 'data' };
  }
  const fallback = isValidPair(defaults[metric]?.low, defaults[metric]?.high)
    ? defaults[metric]
    : FALLBACK_LIMITS[metric];
  const dataTried = low !== undefined || high !== undefined;
  return { low: fallback.low, high: fallback.high, source: dataTried ? 'default-invalid-data' : 'default' };
}

/**
 * Position mode: where the value sits inside its band. 0 at the low limit, 50 mid-band,
 * 100 at the high limit, clamped. Both ends mean "out of range", in opposite directions.
 */
export function positionScore(value: number, limits: LimitPair): number {
  return clamp(((value - limits.low) / (limits.high - limits.low)) * 100);
}

/**
 * Deviation mode: 0 anywhere inside the band, growing with the distance outside it.
 * One full band width outside reaches 100.
 */
export function deviationScore(value: number, limits: LimitPair): number {
  const width = limits.high - limits.low;
  const outside = value < limits.low ? limits.low - value : value > limits.high ? value - limits.high : 0;
  return clamp((outside / width) * 100);
}

/**
 * Status index for a set of readings bound to one zone.
 * Position mode averages the metrics; deviation mode takes the worst, so a hot, dry room
 * can never average out to "normal".
 */
export function zoneIndex(readings: SensorReading[], mode: IndexMode, defaults: DefaultLimits): ZoneIndex {
  const precomputed = readings.map((r) => r.statusIndex).filter((v): v is number => v !== undefined);
  if (precomputed.length > 0) {
    const mean = precomputed.reduce((sum, v) => sum + v, 0) / precomputed.length;
    return {
      value: clamp(mean),
      metrics: [],
      precomputed: true,
      clamped: precomputed.some((v) => v < 0 || v > 100),
    };
  }

  const metrics: MetricScore[] = [];
  for (const reading of readings) {
    for (const metric of ['temperature', 'humidity'] as const) {
      const value = reading[metric];
      if (value === undefined) {
        continue;
      }
      const limits = resolveLimits(reading, metric, defaults);
      const score = mode === 'deviation' ? deviationScore(value, limits) : positionScore(value, limits);
      metrics.push({ metric, value, limits, score });
    }
  }
  if (metrics.length === 0) {
    return { metrics, precomputed: false, clamped: false };
  }
  const scores = metrics.map((m) => m.score);
  const value = mode === 'deviation' ? Math.max(...scores) : scores.reduce((sum, v) => sum + v, 0) / scores.length;
  return { value, metrics, precomputed: false, clamped: false };
}
