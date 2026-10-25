import { DataFrame, Field, FieldType } from '@grafana/data';
import { FieldRoleOverrides } from '../types';

export type FieldRole = keyof FieldRoleOverrides;

export const EMPTY_ROLE_OVERRIDES: FieldRoleOverrides = {
  sensorKey: '',
  sensorLabel: '',
  temperature: '',
  humidity: '',
  temperatureLow: '',
  temperatureHigh: '',
  humidityLow: '',
  humidityHigh: '',
  time: '',
  statusIndex: '',
};

/** Roles that hold numbers, in the order they are reported. */
export const NUMERIC_ROLES = [
  'temperature',
  'humidity',
  'temperatureLow',
  'temperatureHigh',
  'humidityLow',
  'humidityHigh',
  'statusIndex',
] as const;
export type NumericRole = (typeof NUMERIC_ROLES)[number];

/**
 * Names recognised without configuration. Compared after lower-casing and removing
 * everything except letters and digits, so "Sensor ID", "sensor_id" and "sensorId" all match.
 */
const ROLE_NAMES: Record<FieldRole, string[]> = {
  sensorKey: ['sensor', 'sensorid', 'sensorkey', 'device', 'deviceid', 'node', 'nodeid'],
  sensorLabel: ['label', 'sensorlabel', 'sensorname', 'location', 'room', 'zone', 'displayname', 'name'],
  temperature: ['temperature', 'temperaturec', 'temperaturef', 'airtemperature', 'temperaturecelsius'],
  humidity: ['humidity', 'relativehumidity', 'rh', 'humiditypercent', 'humiditypct'],
  temperatureLow: ['temperaturelow', 'temperaturelowerlimit'],
  temperatureHigh: ['temperaturehigh', 'temperatureupperlimit'],
  humidityLow: ['humiditylow', 'humiditylowerlimit'],
  humidityHigh: ['humidityhigh', 'humidityupperlimit'],
  time: ['time', 'timestamp', 'ts'],
  statusIndex: ['statusindex', 'index', 'score'],
};

/** Field names that carry the metric name in the long layout (Flux uses "_field"). */
export const METRIC_NAME_KEYS = ['metric', 'field', 'metricname', 'quantity'];
/** Field names that carry the value in the long layout (Flux uses "_value"). */
export const VALUE_KEYS = ['value'];

export function simplifyName(name: string | undefined | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fieldNames(field: Field): string[] {
  return [field.name, field.config?.displayName, field.config?.displayNameFromDS].filter(
    (name): name is string => typeof name === 'string' && name.length > 0
  );
}

export function fieldMatches(field: Field, simplifiedNames: string[]): boolean {
  return fieldNames(field).some((name) => simplifiedNames.includes(simplifyName(name)));
}

/** Maps a name such as "temperature" or "Humidity High" to its numeric role. */
export function numericRoleForName(name: string | undefined): NumericRole | undefined {
  const simple = simplifyName(name);
  return NUMERIC_ROLES.find((role) => ROLE_NAMES[role].includes(simple));
}

export function roleNames(role: FieldRole): string[] {
  return ROLE_NAMES[role];
}

const isNumberField = (field: Field) => field.type === FieldType.number;
const isTextField = (field: Field) => field.type === FieldType.string || field.type === FieldType.other;

export type ResolvedRoles = Partial<Record<FieldRole, Field>>;

/**
 * Finds the field for each role in one frame. A role chosen in the options must match a field
 * name exactly; it is never replaced by auto-detection, so a wrong choice is visible.
 */
export function resolveRoles(frame: DataFrame, overrides: Partial<FieldRoleOverrides> = {}): ResolvedRoles {
  const resolved: ResolvedRoles = {};
  const taken = new Set<Field>();

  const roles = Object.keys(ROLE_NAMES) as FieldRole[];
  for (const role of roles) {
    const chosen = overrides[role]?.trim();
    if (chosen) {
      const field = frame.fields.find((f) => fieldNames(f).includes(chosen));
      if (field) {
        resolved[role] = field;
        taken.add(field);
      }
    }
  }

  for (const role of roles) {
    if (resolved[role] || overrides[role]?.trim()) {
      continue;
    }
    const free = frame.fields.filter((f) => !taken.has(f));
    let field: Field | undefined;
    if (role === 'time') {
      field = free.find((f) => f.type === FieldType.time) ?? free.find((f) => fieldMatches(f, ROLE_NAMES.time));
    } else if (role === 'sensorKey' || role === 'sensorLabel') {
      field = free.find((f) => isTextField(f) && fieldMatches(f, ROLE_NAMES[role]));
    } else {
      field = free.find((f) => isNumberField(f) && fieldMatches(f, ROLE_NAMES[role]));
    }
    if (field) {
      resolved[role] = field;
      taken.add(field);
    }
  }
  return resolved;
}

/** Looks up a role in series labels, for example {sensor: "sensor-03"} on a Flux series. */
export function labelForRole(labels: Record<string, string> | undefined, role: FieldRole): string | undefined {
  if (!labels) {
    return undefined;
  }
  const names = ROLE_NAMES[role];
  for (const [key, value] of Object.entries(labels)) {
    if (names.includes(simplifyName(key)) && value !== '') {
      return value;
    }
  }
  return undefined;
}
