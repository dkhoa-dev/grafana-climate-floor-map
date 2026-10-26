import { Level, Limits, MetricInfo, MetricState, RoomState, SensorReading } from '../types';
import { hasLimits, levelOf, normalizeName, WELL_KNOWN, worst } from './metrics';

export { bandPosition, levelOf } from './metrics';

export interface EvaluateOptions {
  bindings: Record<string, string>;
  autoBind: boolean;
  /** Metrics to judge, in display order. */
  metrics: MetricInfo[];
  /** Percent of the band width (or of a one-sided limit). */
  warningMargin: number;
  /** Epoch ms the readings are judged against. */
  now: number;
  /** Milliseconds; 0 or less disables the offline check. */
  staleAfterMs: number;
}

/** Room names in markup and sensor locations rarely agree on case or separators. */
const sameName = (a: string | undefined, b: string) => a !== undefined && normalizeName(a) === normalizeName(b);

export function findReading(
  room: string,
  readings: SensorReading[],
  bindings: Record<string, string>,
  autoBind: boolean
): SensorReading | undefined {
  const bound = bindings[room];
  if (bound) {
    return readings.find((r) => r.sensor === bound);
  }
  if (!autoBind) {
    return undefined;
  }
  // A sensor that is explicitly bound elsewhere should not also light up a namesake room.
  const taken = new Set(Object.values(bindings));
  const free = readings.filter((r) => !taken.has(r.sensor));
  return free.find((r) => sameName(r.location, room)) ?? free.find((r) => sameName(r.sensor, room));
}

/** The reading's own limits, or the built-in default for a well-known metric when it has none. */
export const effectiveLimits = (key: string, own: Limits | undefined): Limits | undefined =>
  hasLimits(own) ? own : WELL_KNOWN[key]?.limits;

export function evaluateRoom(room: string, readings: SensorReading[], opts: EvaluateOptions): RoomState {
  const reading = findReading(room, readings, opts.bindings, opts.autoBind);

  if (!reading) {
    // A room bound to a specific sensor expects data; silence from it means the sensor is down.
    return { room, metrics: [], status: opts.bindings[room] ? 'offline' : 'unbound' };
  }

  const metrics: MetricState[] = opts.metrics
    .filter((m) => reading.values[m.key] !== undefined)
    .map((m) => {
      const { value, limits: own } = reading.values[m.key];
      const limits = effectiveLimits(m.key, own);
      return { key: m.key, value, limits, level: limits ? levelOf(value, limits, opts.warningMargin) : undefined };
    });

  if (opts.staleAfterMs > 0 && reading.time !== undefined && opts.now - reading.time > opts.staleAfterMs) {
    return { room, reading, metrics, status: 'offline' };
  }
  // A room whose metrics have no limits at all has nothing to be out of.
  const status = worst(metrics.map((m) => m.level).filter((l): l is Level => l !== undefined)) ?? 'ok';
  return { room, reading, metrics, status };
}
