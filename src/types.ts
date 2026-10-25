/** How a zone's readings turn into one 0–100 number. */
export type IndexMode = 'position' | 'deviation';

/** How the 0–100 number turns into a colour. */
export type ColorMode = 'continuous' | 'banded';

export type MetricId = 'temperature' | 'humidity';

/** Which data field plays which role. Empty string means "detect automatically". */
export interface FieldRoleOverrides {
  sensorKey: string;
  sensorLabel: string;
  temperature: string;
  humidity: string;
  temperatureLow: string;
  temperatureHigh: string;
  humidityLow: string;
  humidityHigh: string;
  time: string;
  statusIndex: string;
}

export interface LimitPair {
  low: number;
  high: number;
}

export interface DefaultLimits {
  temperature: LimitPair;
  humidity: LimitPair;
}

/** Zone name → sensor key. */
export type ZoneBindings = Record<string, string>;

export interface FloorMapOptions {
  planMarkup: string;
  labelAttribute: string;
  zoneTag: string;
  fields: FieldRoleOverrides;
  limits: DefaultLimits;
  staleAfterMinutes: number;
  colorMode: ColorMode;
  indexMode: IndexMode;
  decimals: number;
  fillOpacity: number;
  animate: boolean;
  showLegend: boolean;
  legendText: string[];
  linkTemplate: string;
  linkNewTab: boolean;
  bindings: ZoneBindings;
}

/** One sensor's newest values. Any metric may be missing. */
export interface SensorReading {
  key: string;
  label?: string;
  time?: number;
  temperature?: number;
  humidity?: number;
  temperatureLow?: number;
  temperatureHigh?: number;
  humidityLow?: number;
  humidityHigh?: number;
  statusIndex?: number;
  /** Units taken from the data's field config, when the data sets them. */
  temperatureUnit?: string;
  humidityUnit?: string;
}
