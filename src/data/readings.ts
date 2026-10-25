import { DataFrame, Field, FieldType } from '@grafana/data';
import { FieldRoleOverrides, SensorReading } from '../types';
import {
  fieldMatches,
  labelForRole,
  METRIC_NAME_KEYS,
  NUMERIC_ROLES,
  NumericRole,
  numericRoleForName,
  resolveRoles,
  simplifyName,
  VALUE_KEYS,
} from './fieldRoles';

/** Turns a cell into a finite number, or undefined for null, NaN, blanks and text. */
export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toTime(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? toFiniteNumber(value) : parsed;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

interface Slot {
  value: number;
  /** Reading time; undefined when the data has no time field. */
  time?: number;
  unit?: string;
}

interface Accumulator {
  key: string;
  label?: string;
  labelTime?: number;
  slots: Partial<Record<NumericRole, Slot>>;
}

/** A later value wins when it is at least as new. Without times, the later row wins. */
function isNewer(candidate: number | undefined, current: number | undefined): boolean {
  if (candidate === undefined || current === undefined) {
    return true;
  }
  return candidate >= current;
}

class ReadingCollector {
  private sensors = new Map<string, Accumulator>();

  private entry(key: string): Accumulator {
    let acc = this.sensors.get(key);
    if (!acc) {
      acc = { key, slots: {} };
      this.sensors.set(key, acc);
    }
    return acc;
  }

  addLabel(key: string, label: string | undefined, time: number | undefined) {
    const acc = this.entry(key);
    if (label !== undefined && (acc.label === undefined || isNewer(time, acc.labelTime))) {
      acc.label = label;
      acc.labelTime = time;
    }
  }

  addValue(key: string, role: NumericRole, value: number | undefined, time: number | undefined, unit?: string) {
    const acc = this.entry(key);
    if (value === undefined) {
      return;
    }
    const current = acc.slots[role];
    if (!current || isNewer(time, current.time)) {
      acc.slots[role] = { value, time, unit };
    }
  }

  result(): Map<string, SensorReading> {
    const out = new Map<string, SensorReading>();
    for (const acc of this.sensors.values()) {
      const reading: SensorReading = { key: acc.key };
      if (acc.label !== undefined) {
        reading.label = acc.label;
      }
      for (const role of NUMERIC_ROLES) {
        const slot = acc.slots[role];
        if (slot) {
          reading[role] = slot.value;
          if (slot.time !== undefined) {
            reading.time = Math.max(reading.time ?? slot.time, slot.time);
          }
        }
      }
      if (acc.slots.temperature?.unit) {
        reading.temperatureUnit = acc.slots.temperature.unit;
      }
      if (acc.slots.humidity?.unit) {
        reading.humidityUnit = acc.slots.humidity.unit;
      }
      out.set(acc.key, reading);
    }
    return out;
  }
}

/** Wide and precomputed layouts: one row per reading, the sensor key in a column. */
function readRows(frame: DataFrame, roles: ReturnType<typeof resolveRoles>, sink: ReadingCollector) {
  const keyField = roles.sensorKey!;
  for (let row = 0; row < frame.length; row++) {
    const key = toText(keyField.values[row]);
    if (!key) {
      continue;
    }
    const time = roles.time ? toTime(roles.time.values[row]) : undefined;
    sink.addLabel(key, roles.sensorLabel ? toText(roles.sensorLabel.values[row]) : undefined, time);
    for (const role of NUMERIC_ROLES) {
      const field = roles[role];
      if (field) {
        sink.addValue(key, role, toFiniteNumber(field.values[row]), time, field.config?.unit);
      }
    }
  }
}

/**
 * Long layout: one series per sensor, the sensor key and label in series labels, and the
 * metric name either in a column (one row per metric), in a label, or in the series name.
 */
function readSeries(frame: DataFrame, roles: ReturnType<typeof resolveRoles>, sink: ReadingCollector) {
  const metricField = frame.fields.find(
    (f) => f.type === FieldType.string && fieldMatches(f, METRIC_NAME_KEYS) && f !== roles.sensorLabel
  );
  const timeField = roles.time;
  const valueFields = frame.fields.filter((f) => f.type === FieldType.number);

  for (const field of valueFields) {
    const key = labelForRole(field.labels, 'sensorKey') ?? frame.name?.trim();
    if (!key) {
      continue;
    }
    const label = labelForRole(field.labels, 'sensorLabel');
    const fixedRole = metricField ? undefined : seriesRole(field, frame);
    if (!metricField && !fixedRole) {
      continue;
    }
    for (let row = 0; row < frame.length; row++) {
      const role = metricField ? numericRoleForName(toText(metricField.values[row])) : fixedRole;
      if (!role) {
        continue;
      }
      const time = timeField ? toTime(timeField.values[row]) : undefined;
      sink.addLabel(key, label, time);
      sink.addValue(key, role, toFiniteNumber(field.values[row]), time, field.config?.unit);
    }
  }
}

/** Metric of a long-layout series without a metric column: from a label, or from its own name. */
function seriesRole(field: Field, frame: DataFrame): NumericRole | undefined {
  for (const [labelKey, value] of Object.entries(field.labels ?? {})) {
    if (METRIC_NAME_KEYS.includes(simplifyName(labelKey))) {
      const role = numericRoleForName(value);
      if (role) {
        return role;
      }
    }
  }
  const names = [field.config?.displayNameFromDS, field.config?.displayName, field.name];
  if (VALUE_KEYS.includes(simplifyName(field.name)) && frame.name) {
    names.push(frame.name);
  }
  for (const name of names) {
    const role = numericRoleForName(name);
    if (role) {
      return role;
    }
  }
  return undefined;
}

/**
 * Reduces all frames to the newest reading per sensor key. A sensor that appears in several
 * frames is merged; for each metric the newest value wins (the last row when there is no time).
 */
export function collectReadings(
  frames: DataFrame[],
  overrides: Partial<FieldRoleOverrides> = {}
): Map<string, SensorReading> {
  const sink = new ReadingCollector();
  for (const frame of frames) {
    const roles = resolveRoles(frame, overrides);
    if (roles.sensorKey) {
      readRows(frame, roles, sink);
    } else {
      readSeries(frame, roles, sink);
    }
  }
  return sink.result();
}
