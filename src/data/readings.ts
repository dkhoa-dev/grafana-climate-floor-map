import { DataFrame, Field, FieldType, Labels } from '@grafana/data';
import { SensorFieldConfig, Limits, MetricInfo, SensorReading } from '../types';
import { compareMetricKeys, hasLimits, metricKey, metricName, normalizeName } from './metrics';

export { normalizeName } from './metrics';

export interface FieldNames {
  sensor?: string;
  location?: string;
}

export interface ReadResult {
  readings: SensorReading[];
  /** Metrics found, in the order of the `include` list when given, otherwise well-known first, then by name. */
  metrics: MetricInfo[];
}

// Auto-detection candidates, compared after normalising case and separators.
const SENSOR_NAMES = ['sensor', 'sensorid', 'device', 'deviceid', 'id'];
const LOCATION_NAMES = ['location', 'room', 'description', 'place'];

// Labels that identify the sensor when each series is its own frame.
const SENSOR_LABELS = ['sensor', 'sensor_id', 'device', 'device_id', 'id'];
const LOCATION_LABELS = ['location', 'room', 'place'];

// Names that carry no metric of their own; the series name is used instead.
const GENERIC_VALUE_NAMES = ['value', 'values'];

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

type LimitKind = 'limits' | 'min' | 'max';

/** `temperature_limits`, `co2_max`, `humidity min`… name the limits of another metric. */
export function limitFieldOf(name: string): { key: string; kind: LimitKind } | undefined {
  const n = normalizeName(name);
  for (const [suffix, kind] of [
    ['limits', 'limits'],
    ['limit', 'limits'],
    ['min', 'min'],
    ['max', 'max'],
  ] as const) {
    if (n.length > suffix.length && n.endsWith(suffix)) {
      return { key: metricKey(n.slice(0, -suffix.length)), kind };
    }
  }
  return undefined;
}

const configLimits = (field: Field): Limits | undefined => {
  const custom = field.config.custom as SensorFieldConfig | undefined;
  const limits = { min: toNumber(custom?.limitMin), max: toNumber(custom?.limitMax) };
  return hasLimits(limits) ? limits : undefined;
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

type Sample =
  | { kind: 'value'; sensor: string; location?: string; time?: number; key: string; value: number; config?: Limits }
  | { kind: LimitKind; sensor: string; time?: number; key: string; value: unknown };

interface Draft {
  reading: SensorReading;
  locationTime?: number;
  // Newest time seen per metric value and per limit source.
  times: Map<string, number | undefined>;
  dataLimits: Map<string, Limits>;
  configLimits: Map<string, Limits | undefined>;
}

const isNewer = (time: number | undefined, than: number | undefined) =>
  time === undefined || than === undefined || time >= than;

/** Folds samples into one reading per sensor, keeping the newest value of each metric. */
function merge(samples: Sample[]): SensorReading[] {
  const drafts = new Map<string, Draft>();

  for (const s of samples) {
    let d = drafts.get(s.sensor);
    if (!d) {
      d = {
        reading: { sensor: s.sensor, values: {} },
        times: new Map(),
        dataLimits: new Map(),
        configLimits: new Map(),
      };
      drafts.set(s.sensor, d);
    }
    const slot = `${s.kind}\u0000${s.key}`;
    if (d.times.has(slot) && !isNewer(s.time, d.times.get(slot))) {
      continue;
    }

    if (s.kind === 'value') {
      d.reading.values[s.key] = { value: s.value, time: s.time };
      d.configLimits.set(s.key, s.config);
      if (s.location && isNewer(s.time, d.locationTime)) {
        d.reading.location = s.location;
        d.locationTime = s.time;
      }
      if (s.time !== undefined && (d.reading.time === undefined || s.time > d.reading.time)) {
        d.reading.time = s.time;
      }
    } else {
      const current = d.dataLimits.get(s.key) ?? {};
      if (s.kind === 'limits') {
        const parsed = parseLimits(s.value);
        if (!parsed) {
          continue;
        }
        d.dataLimits.set(s.key, { ...current, ...parsed });
      } else {
        const v = toNumber(s.value);
        if (v === undefined) {
          continue;
        }
        d.dataLimits.set(s.key, { ...current, [s.kind]: v });
      }
    }
    d.times.set(slot, s.time);
  }

  const readings: SensorReading[] = [];
  for (const d of drafts.values()) {
    for (const [key, mv] of Object.entries(d.reading.values)) {
      // Limits sent with the data win over the field config, one side at a time.
      const fromData = d.dataLimits.get(key);
      const fromConfig = d.configLimits.get(key);
      const limits = { min: fromData?.min ?? fromConfig?.min, max: fromData?.max ?? fromConfig?.max };
      if (hasLimits(limits)) {
        mv.limits = Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined)) as Limits;
      }
    }
    if (Object.keys(d.reading.values).length) {
      readings.push(d.reading);
    }
  }
  return readings;
}

class MetricCatalog {
  private byKey = new Map<string, MetricInfo>();

  note(key: string, rawName: string, field: Field) {
    if (!this.byKey.has(key)) {
      this.byKey.set(key, {
        key,
        name: field.config.displayName || metricName(rawName),
        unit: field.config.unit || undefined,
        decimals: field.config.decimals ?? undefined,
      });
    }
  }

  list(): MetricInfo[] {
    // Data sources order columns differently (ClickHouse sorts them), so use a stable order.
    return Array.from(this.byKey.values()).sort((a, b) => compareMetricKeys(a.key, b.key));
  }
}

/** Table layout: one row per reading, with a column naming the sensor. */
function samplesFromTable(frame: DataFrame, sensorField: Field, names: FieldNames, catalog: MetricCatalog): Sample[] {
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  const locationField = findField(frame, names.location, LOCATION_NAMES);
  const columns: Array<
    { field: Field; kind: 'value'; key: string; config?: Limits } | { field: Field; kind: LimitKind; key: string }
  > = [];

  for (const field of frame.fields) {
    if (field === sensorField || field === locationField || field === timeField) {
      continue;
    }
    const limit = limitFieldOf(field.name);
    if (limit) {
      columns.push({ field, ...limit });
    } else if (field.type === FieldType.number && !matches(field.name, undefined, SENSOR_NAMES)) {
      const key = metricKey(field.name);
      catalog.note(key, field.name, field);
      columns.push({ field, kind: 'value', key, config: configLimits(field) });
    }
  }

  const samples: Sample[] = [];
  for (let i = 0; i < frame.length; i++) {
    const sensor = sensorField.values[i];
    if (sensor === null || sensor === undefined || sensor === '') {
      continue;
    }
    const time = timeField ? toTime(timeField.values[i]) : undefined;
    const location = locationField?.values[i] ? String(locationField.values[i]) : undefined;
    for (const c of columns) {
      const raw = c.field.values[i];
      if (c.kind === 'value') {
        const value = toNumber(raw);
        if (value !== undefined) {
          samples.push({ kind: 'value', sensor: String(sensor), location, time, key: c.key, value, config: c.config });
        }
      } else if (raw !== null && raw !== undefined && raw !== '') {
        samples.push({ kind: c.kind, sensor: String(sensor), time, key: c.key, value: raw });
      }
    }
  }
  return samples;
}

/** Series layout: each numeric field is one metric of one sensor, identified by labels or the frame name. */
function samplesFromSeries(frame: DataFrame, names: FieldNames, catalog: MetricCatalog): Sample[] {
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  const samples: Sample[] = [];

  for (const field of frame.fields) {
    if (field === timeField || field.type !== FieldType.number) {
      continue;
    }
    // Flux puts the measured field name in the `_field` label and calls the values `_value`.
    let rawName = field.labels?._field ?? field.name;
    if (GENERIC_VALUE_NAMES.includes(normalizeName(rawName)) && frame.name) {
      rawName = frame.name;
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
    const limit = limitFieldOf(rawName);
    const key = limit ? limit.key : metricKey(rawName);
    if (!limit) {
      catalog.note(key, rawName, field);
    }

    // Only the newest non-empty value matters.
    for (let i = field.values.length - 1; i >= 0; i--) {
      const value = toNumber(field.values[i]);
      if (value === undefined) {
        continue;
      }
      const time = timeField ? toTime(timeField.values[i]) : undefined;
      if (limit) {
        samples.push({ kind: limit.kind, sensor, time, key, value });
        break;
      }
      samples.push({ kind: 'value', sensor, location, time, key, value, config: configLimits(field) });
      // Some data sources (ClickHouse's time series format, for one) turn text columns into labels,
      // so limits can arrive as labels on the value series.
      for (const [labelKey, labelValue] of Object.entries(field.labels ?? {})) {
        const labelLimit = limitFieldOf(labelKey);
        if (labelLimit && labelValue !== '') {
          samples.push({ kind: labelLimit.kind, sensor, time, key: labelLimit.key, value: labelValue });
        }
      }
      break;
    }
  }
  return samples;
}

/** Splits the "Metrics" option into metric keys; empty means every metric. */
export const parseMetricList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(metricKey);

/**
 * Turns query results into the latest reading per sensor, and lists the metrics found.
 * With `include`, only those metrics are kept, in that order.
 */
export function readingsFromFrames(frames: DataFrame[], names: FieldNames = {}, include: string[] = []): ReadResult {
  const catalog = new MetricCatalog();
  const samples: Sample[] = [];
  for (const frame of frames) {
    const sensorField = findField(frame, names.sensor, SENSOR_NAMES, FieldType.string);
    samples.push(
      ...(sensorField ? samplesFromTable(frame, sensorField, names, catalog) : samplesFromSeries(frame, names, catalog))
    );
  }

  const keep = include.length ? new Set(include) : undefined;
  let readings = merge(samples);
  let metrics = catalog.list();
  if (keep) {
    metrics = include.map((k) => metrics.find((m) => m.key === k)).filter((m): m is MetricInfo => m !== undefined);
    readings = readings
      .map((r) => {
        const values = Object.fromEntries(Object.entries(r.values).filter(([k]) => keep.has(k)));
        const times = Object.values(values)
          .map((v) => v.time)
          .filter((t): t is number => t !== undefined);
        return { ...r, values, time: times.length ? Math.max(...times) : undefined };
      })
      .filter((r) => Object.keys(r.values).length > 0);
  }
  return { readings, metrics };
}
