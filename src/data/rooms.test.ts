import { SensorReading } from '../types';
import { bandPosition, evaluateRoom, EvaluateOptions, findReading, levelOf } from './rooms';
import { mixHex, roomColor, valueColor } from './colors';

const limits = { min: 20, max: 30 };

describe('levelOf', () => {
  it.each([
    [25, 'ok'],
    [20.5, 'warning'],
    [21, 'ok'],
    [29.5, 'warning'],
    [20, 'warning'],
    [19.9, 'alarm'],
    [31, 'alarm'],
  ])('%p is %p with a 10%% margin', (value, level) => {
    expect(levelOf(value, limits, 10)).toBe(level);
  });

  it('never warns with a zero margin', () => {
    expect(levelOf(20, limits, 0)).toBe('ok');
  });
});

describe('findReading', () => {
  const readings: SensorReading[] = [
    { sensor: 'a', location: 'Lab_1', temperature: 20 },
    { sensor: 'office-b', temperature: 21 },
    { sensor: 'c', location: 'Office A', temperature: 22 },
  ];

  it('prefers an explicit binding', () => {
    expect(findReading('Lab 1', readings, { 'Lab 1': 'c' }, true)?.sensor).toBe('c');
  });

  it('matches location, then sensor id, ignoring case and separators', () => {
    expect(findReading('lab 1', readings, {}, true)?.sensor).toBe('a');
    expect(findReading('Office B', readings, {}, true)?.sensor).toBe('office-b');
  });

  it('does not auto-bind a sensor that is bound to another room', () => {
    expect(findReading('Office A', readings, { Lobby: 'c' }, true)).toBeUndefined();
  });

  it('respects autoBind = false', () => {
    expect(findReading('Lab 1', readings, {}, false)).toBeUndefined();
  });

  it('ignores bindings cleared to undefined', () => {
    const cleared = { 'Lab 1': undefined } as unknown as Record<string, string>;
    expect(findReading('Lab 1', readings, cleared, true)?.sensor).toBe('a');
  });
});

describe('evaluateRoom', () => {
  const base: EvaluateOptions = {
    bindings: {},
    autoBind: true,
    defaultTemperature: { min: 18, max: 27 },
    defaultHumidity: { min: 30, max: 60 },
    warningMargin: 10,
    now: 10_000,
    staleAfterMs: 5_000,
  };

  it('is unbound without a matching sensor', () => {
    expect(evaluateRoom('Attic', [], base).status).toBe('unbound');
  });

  it('is offline when its chosen sensor sends nothing at all', () => {
    expect(evaluateRoom('Attic', [], { ...base, bindings: { Attic: 'n-99' } }).status).toBe('offline');
  });

  it('is offline when the newest reading is too old', () => {
    const r = [{ sensor: 'Lab', time: 1_000, temperature: 22 }];
    expect(evaluateRoom('Lab', r, base).status).toBe('offline');
    expect(evaluateRoom('Lab', r, { ...base, staleAfterMs: 0 }).status).toBe('ok');
  });

  it('takes the worst level and prefers limits carried by the data', () => {
    const r = [{ sensor: 'Lab', time: 9_000, temperature: 22, humidity: 70, temperatureLimits: { min: 21, max: 23 } }];
    const state = evaluateRoom('Lab', r, base);
    expect(state.temperatureLevel).toBe('ok');
    expect(state.humidityLevel).toBe('alarm');
    expect(state.status).toBe('alarm');
    expect(state.temperatureLimits).toEqual({ min: 21, max: 23 });
    expect(state.humidityLimits).toEqual(base.defaultHumidity);
  });
});

describe('colours', () => {
  const lookup = (name: string) =>
    ({ blue: '#0000ff', green: '#00ff00', orange: '#ff8000', red: '#ff0000', 'dark-blue': '#000080' })[name] ?? name;

  it('mixes hex colours', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('red', '#ffffff', 0.2)).toBe('red');
  });

  it('maps band position to the value scale', () => {
    expect(bandPosition(25, limits)).toBe(0.5);
    expect(valueColor(-0.1, lookup)).toBe('#000080');
    expect(valueColor(0.5, lookup)).toBe('#00ff00');
    expect(valueColor(1.2, lookup)).toBe('#ff0000');
  });

  it('leaves unbound rooms unpainted and greys out offline ones', () => {
    const state = { room: 'x', temperatureLimits: limits, humidityLimits: limits };
    expect(roomColor({ ...state, status: 'unbound' }, 'status', lookup)).toBeUndefined();
    expect(roomColor({ ...state, status: 'offline' }, 'temperature', lookup)).toBe('text-disabled');
    expect(roomColor({ ...state, status: 'alarm' }, 'status', lookup)).toBe('#ff0000');
  });
});
