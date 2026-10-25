import { DefaultLimits } from '../types';
import { deviationScore, FALLBACK_LIMITS, positionScore, resolveLimits, zoneIndex } from './statusIndex';

const defaults: DefaultLimits = { temperature: { low: 20, high: 26 }, humidity: { low: 30, high: 60 } };

describe('positionScore', () => {
  it.each([
    [20, 0],
    [23, 50],
    [26, 100],
    [24.5, 75],
    [10, 0],
    [40, 100],
  ])('value %p in 20–26 → %p', (value, expected) => {
    expect(positionScore(value, { low: 20, high: 26 })).toBeCloseTo(expected);
  });
});

describe('deviationScore', () => {
  it.each([
    [23, 0],
    [20, 0],
    [26, 0],
    [29, 50],
    [17, 50],
    [32, 100],
    [50, 100],
  ])('value %p against 20–26 → %p', (value, expected) => {
    expect(deviationScore(value, { low: 20, high: 26 })).toBeCloseTo(expected);
  });
});

describe('resolveLimits', () => {
  it('uses limits from the data when both are valid', () => {
    expect(resolveLimits({ key: 's', temperatureLow: 15, temperatureHigh: 18 }, 'temperature', defaults)).toEqual({
      low: 15,
      high: 18,
      source: 'data',
    });
  });

  it('falls back to defaults and says so when data limits are invalid', () => {
    expect(resolveLimits({ key: 's', humidityLow: 70, humidityHigh: 40 }, 'humidity', defaults)).toEqual({
      low: 30,
      high: 60,
      source: 'default-invalid-data',
    });
    expect(resolveLimits({ key: 's', humidityLow: 40 }, 'humidity', defaults).source).toBe('default-invalid-data');
    expect(resolveLimits({ key: 's', humidityLow: 50, humidityHigh: 50 }, 'humidity', defaults).source).toBe(
      'default-invalid-data'
    );
  });

  it('uses panel defaults when the data has no limits', () => {
    expect(resolveLimits({ key: 's' }, 'temperature', defaults)).toEqual({ low: 20, high: 26, source: 'default' });
  });

  it('uses the built-in band when the panel defaults themselves are invalid', () => {
    const broken = { ...defaults, temperature: { low: 30, high: 10 } };
    expect(resolveLimits({ key: 's' }, 'temperature', broken)).toMatchObject(FALLBACK_LIMITS.temperature);
  });
});

describe('zoneIndex', () => {
  it('averages the metric positions in position mode', () => {
    const index = zoneIndex([{ key: 's', temperature: 26, humidity: 45 }], 'position', defaults);
    expect(index.value).toBeCloseTo(75);
    expect(index.metrics.map((m) => [m.metric, m.score])).toEqual([
      ['temperature', 100],
      ['humidity', 50],
    ]);
  });

  it('shows how a hot, dry room averages to mid-band in position mode', () => {
    const index = zoneIndex([{ key: 's', temperature: 30, humidity: 10 }], 'position', defaults);
    expect(index.value).toBe(50);
    expect(index.metrics.map((m) => m.score)).toEqual([100, 0]);
  });

  it('takes the worst metric in deviation mode, so opposite errors do not cancel', () => {
    // temperature 3 °C above (score 50), humidity 6 % below (score 20): worst is 50, mean would be 35.
    const index = zoneIndex([{ key: 's', temperature: 29, humidity: 24 }], 'deviation', defaults);
    expect(index.value).toBeCloseTo(50);
    expect(index.metrics.map((m) => m.score)).toEqual([expect.closeTo(50), expect.closeTo(20)]);
  });

  it('uses a single metric when only one is present', () => {
    const index = zoneIndex([{ key: 's', humidity: 54 }], 'position', defaults);
    expect(index.value).toBeCloseTo(80);
    expect(index.metrics).toHaveLength(1);
  });

  it('has no value when no metric is usable', () => {
    expect(zoneIndex([{ key: 's' }], 'position', defaults)).toEqual({
      metrics: [],
      precomputed: false,
      clamped: false,
    });
  });

  it('prefers a ready-made index and clamps it with a flag', () => {
    expect(zoneIndex([{ key: 's', statusIndex: 130, temperature: 23 }], 'position', defaults)).toEqual({
      value: 100,
      metrics: [],
      precomputed: true,
      clamped: true,
    });
    expect(zoneIndex([{ key: 's', statusIndex: 42 }], 'deviation', defaults)).toMatchObject({
      value: 42,
      clamped: false,
    });
    expect(zoneIndex([{ key: 's', statusIndex: -5 }], 'position', defaults)).toMatchObject({ value: 0, clamped: true });
  });
});
