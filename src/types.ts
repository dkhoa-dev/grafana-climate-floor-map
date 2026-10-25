export type ColorBy = 'status' | 'temperature' | 'humidity';

export interface ClimateFloorOptions {
  /** Floor plan markup. Rooms are elements with `data-room="<name>"` or an id of `room-<name>` / `room:<name>`. */
  floorPlan: string;

  /** Field names, matched case-insensitively. Blank means auto-detect. */
  sensorField: string;
  locationField: string;
  temperatureField: string;
  humidityField: string;

  /** Grafana interval such as `15m`. A sensor with no reading for longer is shown as offline. Blank disables. */
  staleAfter: string;

  temperatureMin: number;
  temperatureMax: number;
  humidityMin: number;
  humidityMax: number;
  /** Share of the limit band, in percent, that counts as "near the limit" on each side. */
  warningMargin: number;

  colorBy: ColorBy;
  showValues: boolean;
  decimals: number;
  showLegend: boolean;

  /** Room name to sensor id. Rooms not listed here fall back to auto-binding. */
  bindings: Record<string, string>;
  autoBind: boolean;

  linkUrl: string;
  linkNewTab: boolean;
}

export interface Limits {
  min: number;
  max: number;
}

export interface SensorReading {
  sensor: string;
  location?: string;
  /** Epoch milliseconds of the newest value. */
  time?: number;
  temperature?: number;
  humidity?: number;
  temperatureLimits?: Limits;
  humidityLimits?: Limits;
}

export type Level = 'ok' | 'warning' | 'alarm';
export type RoomStatus = Level | 'offline' | 'unbound';

export interface RoomState {
  room: string;
  reading?: SensorReading;
  status: RoomStatus;
  temperatureLevel?: Level;
  humidityLevel?: Level;
  temperatureLimits: Limits;
  humidityLimits: Limits;
}
