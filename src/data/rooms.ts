import { Level, Limits, RoomState, RoomStatus, SensorReading } from '../types';
import { normalizeName } from './readings';

export interface EvaluateOptions {
  bindings: Record<string, string>;
  autoBind: boolean;
  defaultTemperature: Limits;
  defaultHumidity: Limits;
  /** Percent of the band width, per side. */
  warningMargin: number;
  /** Epoch ms the readings are judged against. */
  now: number;
  /** Milliseconds; 0 or less disables the offline check. */
  staleAfterMs: number;
}

const RANK: Record<Level, number> = { ok: 0, warning: 1, alarm: 2 };

/** Where a value sits relative to its band: outside is an alarm, inside but within the margin is a warning. */
export function levelOf(value: number, limits: Limits, marginPercent: number): Level {
  if (value < limits.min || value > limits.max) {
    return 'alarm';
  }
  const margin = ((limits.max - limits.min) * Math.max(0, marginPercent)) / 100;
  if (value < limits.min + margin || value > limits.max - margin) {
    return 'warning';
  }
  return 'ok';
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

export function evaluateRoom(room: string, readings: SensorReading[], opts: EvaluateOptions): RoomState {
  const reading = findReading(room, readings, opts.bindings, opts.autoBind);
  const temperatureLimits = reading?.temperatureLimits ?? opts.defaultTemperature;
  const humidityLimits = reading?.humidityLimits ?? opts.defaultHumidity;
  const base = { room, reading, temperatureLimits, humidityLimits };

  if (!reading) {
    return { ...base, status: 'unbound' };
  }
  if (opts.staleAfterMs > 0 && reading.time !== undefined && opts.now - reading.time > opts.staleAfterMs) {
    return { ...base, status: 'offline' };
  }

  const temperatureLevel =
    reading.temperature !== undefined ? levelOf(reading.temperature, temperatureLimits, opts.warningMargin) : undefined;
  const humidityLevel =
    reading.humidity !== undefined ? levelOf(reading.humidity, humidityLimits, opts.warningMargin) : undefined;
  const levels = [temperatureLevel, humidityLevel].filter((l): l is Level => l !== undefined);
  const status: RoomStatus = levels.reduce<Level>((worst, l) => (RANK[l] > RANK[worst] ? l : worst), 'ok');

  return { ...base, status, temperatureLevel, humidityLevel };
}

/** Position of a value in its band: 0 at min, 1 at max, below 0 or above 1 when out of limits. */
export const bandPosition = (value: number, limits: Limits) =>
  limits.max === limits.min ? 0.5 : (value - limits.min) / (limits.max - limits.min);
