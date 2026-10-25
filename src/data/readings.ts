import { DataFrame, Field, FieldType, Labels } from '@grafana/data';
import { Limits, SensorReading } from '../types';

export interface FieldNames {
  sensor?: string;
  location?: string;
  temperature?: string;
  humidity?: string;
}

type Metric =
  | 'temperature'
  | 'humidity'
  | 'temperatureLimits'
  | 'humidityLimits'
  | 'temperatureMin'
  | 'temperatureMax'
  | 'humidityMin'
  | 'humidityMax';

// Auto-detection candidates, compared after normalising case and separators.
const CANDIDATES: Record<Metric | 'sensor' | 'location', string[]> = {
  sensor: ['sensor', 'sensorid', 'device', 'deviceid', 'id'],
  location: ['location', 'room', 'description', 'place'],
  temperature: ['temperature', 't'],
  humidity: ['humidity', 'rh'],
  temperatureLimits: ['temperaturelimits', 'temperaturelimit'],
  humidityLimits: ['humiditylimits', 'humiditylimit'],
  temperatureMin: ['temperaturemin'],
  temperatureMax: ['temperaturemax'],
  humidityMin: ['humiditymin'],
  humidityMax: ['humiditymax'],
};

// Labels that identify the sensor when each series is its own frame.
const SENSOR_LABELS = ['sensor', 'sensor_id', 'device', 'device_id', 'id'];
const LOCATION_LABELS = ['location', 'room', 'place'];

export const normalizeName = (name: string) => name.toLowerCase().replace(/[\s_\-.]/g, '');

const matches = (name: string | undefined, override: string | undefined, candidates: string[]) => {
  if (!name) {
    return false;
  }
  const n = normalizeName(name);
  return override ? n === normalizeName(override) : candidates.includes(n);
};

const findField = (frame: DataFrame, override: string | undefined, candidates: string[], type?: FieldType) =>
  frame.fields.find((f) => (!type || f.type === type) && matches(f.name, override, candidates));

/** Parses `18-30`, `18..30`, `18,30` or `-5 - 10` into limits. */
export function parseLimits(value: unknown): Limits | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:-|\.\.|,|–|~)\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) {
    return undefined;
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toTime = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? toNumber(value) : t;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return undefined;
};

const metricOf = (name: string, names: FieldNames): Metric | undefined => {
  if (matches(name, names.temperature, CANDIDATES.temperature)) {
    return 'temperature';
  }
  if (matches(name, names.humidity, CANDIDATES.humidity)) {
    return 'humidity';
  }
  const metrics: Metric[] = [
    'temperatureLimits',
    'humidityLimits',
    'temperatureMin',
    'temperatureMax',
    'humidityMin',
    'humidityMax',
  ];
  return metrics.find((m) => matches(name, undefined, CANDIDATES[m]));
};

const pickLabel = (labels: Labels | undefined, keys: string[], override?: string) => {
  if (!labels) {
    return undefined;
  }
  const wanted = override ? [override, ...keys] : keys;
  for (const key of wanted) {
    const hit = Object.keys(labels).find((k) => normalizeName(k) === normalizeName(key));
    if (hit && labels[hit]) {
      return labels[hit];
    }
  }
  return undefined;
};

interface Sample {
  sensor: string;
  location?: string;
  time?: number;
  metric: Metric;
  value: unknown;
}

const isNewer = (time: number | undefined, than: number | undefined) =>
  time === undefined || than === undefined || time >= than;

/** Folds samples into one reading per sensor, keeping the newest value of each metric. */
function merge(samples: Sample[]): SensorReading[] {
  const bySensor = new Map<string, SensorReading>();
  const metricTimes = new Map<string, number | undefined>();

  for (const s of samples) {
    let reading = bySensor.get(s.sensor);
    if (!reading) {
      reading = { sensor: s.sensor };
      bySensor.set(s.sensor, reading);
    }
    if (s.location && isNewer(s.time, metricTimes.get(`${s.sensor}\u0000location`))) {
      reading.location = s.location;
      metricTimes.set(`${s.sensor}\u0000location`, s.time);
    }

    const key = `${s.sensor}\u0000${s.metric}`;
    if (metricTimes.has(key) && !isNewer(s.time, metricTimes.get(key))) {
      continue;
    }

    switch (s.metric) {
      case 'temperature':
      case 'humidity': {
        const v = toNumber(s.value);
        if (v === undefined) {
          continue;
        }
        reading[s.metric] = v;
        if (s.time !== undefined && (reading.time === undefined || s.time > reading.time)) {
          reading.time = s.time;
        }
        break;
      }
      case 'temperatureLimits':
      case 'humidityLimits': {
        const limits = parseLimits(s.value);
        if (!limits) {
          continue;
        }
        reading[s.metric] = limits;
        break;
      }
      default: {
        const v = toNumber(s.value);
        if (v === undefined) {
          continue;
        }
        const target = s.metric.startsWith('temperature') ? 'temperatureLimits' : 'humidityLimits';
        const bound = s.metric.endsWith('Min') ? 'min' : 'max';
        reading[target] = { min: NaN, max: NaN, ...reading[target], [bound]: v };
      }
    }
    metricTimes.set(key, s.time);
  }

  // A min without a max (or the reverse) is not a usable band.
  for (const r of bySensor.values()) {
    for (const key of ['temperatureLimits', 'humidityLimits'] as const) {
      const l = r[key];
      if (l && (Number.isNaN(l.min) || Number.isNaN(l.max))) {
        delete r[key];
      }
    }
  }

  return Array.from(bySensor.values()).filter((r) => r.temperature !== undefined || r.humidity !== undefined);
}

/** Table layout: one row per reading, with a column naming the sensor. */
function samplesFromTable(frame: DataFrame, sensorField: Field, names: FieldNames): Sample[] {
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  const locationField = findField(frame, names.location, CANDIDATES.location);
  const metricFields = frame.fields
    .filter((f) => f !== sensorField && f !== locationField && f !== timeField)
    .map((f) => ({ field: f, metric: metricOf(f.name, names) }))
    .filter((m): m is { field: Field; metric: Metric } => m.metric !== undefined);

  const samples: Sample[] = [];
  for (let i = 0; i < frame.length; i++) {
    const sensor = sensorField.values[i];
    if (sensor === null || sensor === undefined || sensor === '') {
      continue;
    }
    const time = timeField ? toTime(timeField.values[i]) : undefined;
    const location = locationField?.values[i] ? String(locationField.values[i]) : undefined;
    for (const { field, metric } of metricFields) {
      samples.push({ sensor: String(sensor), location, time, metric, value: field.values[i] });
    }
  }
  return samples;
}

/** Series layout: each numeric field is one metric of one sensor, identified by labels or the frame name. */
function samplesFromSeries(frame: DataFrame, names: FieldNames): Sample[] {
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  const samples: Sample[] = [];

  for (const field of frame.fields) {
    if (field === timeField) {
      continue;
    }
    // Flux puts the measured field name in the `_field` label and calls the values `_value`.
    const metric = metricOf(field.labels?._field ?? field.name, names) ?? metricOf(frame.name ?? '', names);
    if (!metric) {
      continue;
    }
    const sensor =
      pickLabel(field.labels, SENSOR_LABELS, names.sensor) ??
      frame.name ??
      field.config.displayNameFromDS ??
      frame.refId;
    if (!sensor) {
      continue;
    }
    const location = pickLabel(field.labels, LOCATION_LABELS, names.location);

    // Only the newest non-empty value matters.
    for (let i = field.values.length - 1; i >= 0; i--) {
      const value = field.values[i];
      if (value !== null && value !== undefined && value !== '') {
        const time = timeField ? toTime(timeField.values[i]) : undefined;
        samples.push({ sensor, location, time, metric, value });
        break;
      }
    }
  }
  return samples;
}

/** Turns query results into the latest reading per sensor. */
export function readingsFromFrames(frames: DataFrame[], names: FieldNames = {}): SensorReading[] {
  const samples: Sample[] = [];
  for (const frame of frames) {
    const sensorField = findField(frame, names.sensor, CANDIDATES.sensor, FieldType.string);
    samples.push(...(sensorField ? samplesFromTable(frame, sensorField, names) : samplesFromSeries(frame, names)));
  }
  return merge(samples);
}
