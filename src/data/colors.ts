import { RoomState, RoomStatus } from '../types';
import { bandPosition } from './metrics';

/** Resolves a Grafana palette name (e.g. `green`) to a CSS colour. */
export type ColorLookup = (name: string) => string;

export const STATUS_COLOR: Record<RoomStatus, string> = {
  ok: 'green',
  warning: 'orange',
  alarm: 'red',
  offline: 'text-disabled',
  unbound: 'transparent',
};

export const STATUS_LABEL: Record<RoomStatus, string> = {
  ok: 'Within limits',
  warning: 'Near a limit',
  alarm: 'Out of limits',
  offline: 'Offline',
  unbound: 'No sensor',
};

// Value mode: cold edge of the band is blue, the middle green, the warm edge orange.
const VALUE_STOPS: Array<[number, string]> = [
  [0, 'blue'],
  [0.5, 'green'],
  [1, 'orange'],
];

const parseHex = (hex: string): [number, number, number] | undefined => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return undefined;
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Linear blend of two hex colours; falls back to the nearer end when either is not hex. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) {
    return t < 0.5 ? a : b;
  }
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function valueColor(position: number, lookup: ColorLookup): string {
  if (position < 0) {
    return lookup('dark-blue');
  }
  if (position > 1) {
    return lookup('red');
  }
  for (let i = 1; i < VALUE_STOPS.length; i++) {
    const [p1, c1] = VALUE_STOPS[i];
    if (position <= p1) {
      const [p0, c0] = VALUE_STOPS[i - 1];
      return mixHex(lookup(c0), lookup(c1), (position - p0) / (p1 - p0));
    }
  }
  return lookup(VALUE_STOPS[VALUE_STOPS.length - 1][1]);
}

/** Fill for a room, or undefined when the room should stay unpainted. `colorBy` is `status` or a metric key. */
export function roomColor(state: RoomState, colorBy: string, lookup: ColorLookup): string | undefined {
  if (state.status === 'unbound') {
    return undefined;
  }
  if (state.status === 'offline' || colorBy === 'status') {
    return lookup(STATUS_COLOR[state.status]);
  }
  const metric = state.metrics.find((m) => m.key === colorBy);
  const position = metric?.limits ? bandPosition(metric.value, metric.limits) : undefined;
  // Without the metric, or without limits to place it against, there is nothing to show.
  return position === undefined ? lookup(STATUS_COLOR.offline) : valueColor(position, lookup);
}
