import { MetricInfo, SensorReading } from '../types';
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

  it.each([
    [800, 'ok'],
    [950, 'warning'],
    [1001, 'alarm'],
  ])('measures a one-sided max: %p is %p', (value, level) => {
    expect(levelOf(value, { max: 1000 }, 10)).toBe(level);
  });

  it.each([
    [25, 'ok'],
    [20.5, 'warning'],
    [19, 'alarm'],
  ])('measures a one-sided min: %p is %p', (value, level) => {
    expect(levelOf(value, { min: 20 }, 10)).toBe(level);
  });
});

const reading = (sensor: string, location: string | undefined, values: SensorReading['values'], time?: number) => ({
  sensor,
  location,
  time,
  values,
});

describe('findReading', () => {
  const readings: SensorReading[] = [
    reading('a', 'Lab_1', { temperature: { value: 20 } }),
    reading('office-b', undefined, { temperature: { value: 21 } }),
    reading('c', 'Office A', { temperature: { value: 22 } }),
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
  const metric = (key: string): MetricInfo => ({ key, name: key });
  const base: EvaluateOptions = {
    bindings: {},
    autoBind: true,
    metrics: ['temperature', 'humidity', 'co2', 'battery'].map(metric),
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
    const r = [reading('Lab', undefined, { temperature: { value: 22 } }, 1_000)];
    expect(evaluateRoom('Lab', r, base).status).toBe('offline');
    expect(evaluateRoom('Lab', r, { ...base, staleAfterMs: 0 }).status).toBe('ok');
  });

  it('takes the worst level over every metric, own limits first, built-in defaults otherwise', () => {
    const r = [
      reading(
        'Lab',
        undefined,
        {
          temperature: { value: 22, limits: { min: 21, max: 23 } },
          humidity: { value: 45 },
          co2: { value: 1200 },
          battery: { value: 3 },
        },
        9_000
      ),
    ];
    const state = evaluateRoom('Lab', r, base);
    expect(state.metrics).toEqual([
      { key: 'temperature', value: 22, limits: { min: 21, max: 23 }, level: 'ok' },
      { key: 'humidity', value: 45, limits: { min: 30, max: 60 }, level: 'ok' },
      // Built-in CO₂ limit (≤ 1000 ppm).
      { key: 'co2', value: 1200, limits: { max: 1000 }, level: 'alarm' },
      // Not well known and no limits configured: shown, but not judged.
      { key: 'battery', value: 3, limits: undefined, level: undefined },
    ]);
    expect(state.status).toBe('alarm');
  });

  it('is within limits when no metric has limits', () => {
    const r = [reading('Lab', undefined, { battery: { value: 3 } }, 9_000)];
    expect(evaluateRoom('Lab', r, base).status).toBe('ok');
  });

  it('judges only the metrics it is given', () => {
    const r = [reading('Lab', undefined, { co2: { value: 1200 }, humidity: { value: 45 } }, 9_000)];
    const state = evaluateRoom('Lab', r, { ...base, metrics: [metric('humidity')] });
    expect(state.metrics.map((m) => m.key)).toEqual(['humidity']);
    expect(state.status).toBe('ok');
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
    expect(bandPosition(500, { max: 1000 })).toBe(0.5);
    expect(bandPosition(10, { min: 20 })).toBe(-1);
    expect(bandPosition(10, {})).toBeUndefined();
    expect(valueColor(-0.1, lookup)).toBe('#000080');
    expect(valueColor(0.5, lookup)).toBe('#00ff00');
    expect(valueColor(1.2, lookup)).toBe('#ff0000');
  });

  it('colours by status, by a metric, or greys out what cannot be placed', () => {
    const state = (status: 'ok' | 'alarm' | 'offline' | 'unbound') => ({
      room: 'x',
      status,
      metrics: [
        { key: 'co2', value: 1500, limits: { max: 1000 }, level: 'alarm' as const },
        { key: 'battery', value: 3 },
      ],
    });
    expect(roomColor(state('unbound'), 'status', lookup)).toBeUndefined();
    expect(roomColor(state('offline'), 'co2', lookup)).toBe('text-disabled');
    expect(roomColor(state('alarm'), 'status', lookup)).toBe('#ff0000');
    expect(roomColor(state('alarm'), 'co2', lookup)).toBe('#ff0000');
    expect(roomColor(state('ok'), 'battery', lookup)).toBe('text-disabled');
  });
});
