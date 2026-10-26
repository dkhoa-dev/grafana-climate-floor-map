export interface SensorFloorOptions {
  /** Floor plan markup. Rooms are elements with `data-room="<name>"` or an id of `room-<name>`. */
  floorPlan: string;

  /** Field or label names, matched case-insensitively. Blank means auto-detect. */
  sensorField: string;
  locationField: string;
  /** Comma-separated metric names to use, in this order. Blank uses every numeric field. */
  metrics: string;

  /** Grafana interval such as `15m`. A sensor with no reading for longer is shown as offline. Blank disables. */
  staleAfter: string;

  /** Share of the limit band (or of a one-sided limit), in percent, that counts as "near the limit". */
  warningMargin: number;

  /** `status`, or the key of the metric whose position in its band colours the rooms. */
  colorBy: string;
  showValues: boolean;
  showLegend: boolean;

  /** Room name to sensor id. Rooms not listed here fall back to auto-binding. */
  bindings: Record<string, string>;
  autoBind: boolean;

  linkUrl: string;
  linkNewTab: boolean;
}

/** Custom per-field settings, set under the panel's field config or per metric with overrides. */
export interface SensorFieldConfig {
  limitMin?: number;
  limitMax?: number;
}

/** A band of acceptable values. Either side may be missing, for one-sided limits such as CO₂ ≤ 1000. */
export interface Limits {
  min?: number;
  max?: number;
}

/** A measured quantity found in the data, such as temperature or CO₂. */
export interface MetricInfo {
  /** Normalised name, used to match fields, labels, options and overrides. */
  key: string;
  /** Display name: the field's display name if set, otherwise derived from the field name. */
  name: string;
  /** Grafana unit id from the field config. */
  unit?: string;
  decimals?: number;
}

export interface MetricReading {
  value: number;
  /** Epoch milliseconds of this value. */
  time?: number;
  /** From the data (limit columns or labels) or the field config, in that order. */
  limits?: Limits;
}

export interface SensorReading {
  sensor: string;
  location?: string;
  /** Epoch milliseconds of the newest value of any metric. */
  time?: number;
  values: Record<string, MetricReading>;
}

export type Level = 'ok' | 'warning' | 'alarm';
export type RoomStatus = Level | 'offline' | 'unbound';

export interface MetricState {
  key: string;
  value: number;
  /** Limits in effect: the reading's own, or the built-in default for a well-known metric. */
  limits?: Limits;
  /** Undefined when the metric has no limits. */
  level?: Level;
}

export interface RoomState {
  room: string;
  reading?: SensorReading;
  status: RoomStatus;
  metrics: MetricState[];
}
