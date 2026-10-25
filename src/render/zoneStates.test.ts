import { createTheme, FieldColorModeId, ThresholdsMode } from '@grafana/data';
import { FloorMapOptions, SensorReading } from '../types';
import { computeZoneStates, indexColor, OFFLINE_MARK, STALE_MARK, zoneVisual } from './zoneStates';

const theme = createTheme();
const base = {
  bindings: { 'Lab 1': 's1', Lobby: 's2', Store: 's3' },
  indexMode: 'position' as const,
  limits: { temperature: { low: 20, high: 26 }, humidity: { low: 30, high: 60 } },
  staleAfterMinutes: 0,
};
const now = 10 * 60 * 60000;
const readings = new Map<string, SensorReading>([
  ['s1', { key: 's1', temperature: 23, humidity: 45, time: now - 60000 }],
  ['s2', { key: 's2', temperature: 26, time: now - 30 * 60000 }],
]);

describe('computeZoneStates', () => {
  it('classifies unbound, offline and live zones', () => {
    const states = computeZoneStates(['Lab 1', 'Lobby', 'Store', 'Hall'], base, readings, now);
    expect(states.get('Lab 1')).toMatchObject({ status: 'live', sensorKey: 's1', ageMs: 60000 });
    expect(states.get('Lab 1')?.index?.value).toBeCloseTo(50);
    expect(states.get('Lobby')?.status).toBe('live');
    expect(states.get('Store')).toEqual({ zone: 'Store', status: 'offline', sensorKey: 's3' });
    expect(states.get('Hall')).toEqual({ zone: 'Hall', status: 'unbound' });
  });

  it('marks readings older than the threshold as stale', () => {
    const states = computeZoneStates(['Lab 1', 'Lobby'], { ...base, staleAfterMinutes: 15 }, readings, now);
    expect(states.get('Lab 1')?.status).toBe('live');
    expect(states.get('Lobby')?.status).toBe('stale');
  });

  it('never marks a reading without time as stale', () => {
    const noTime = new Map([['s1', { key: 's1', temperature: 22 }]]);
    expect(computeZoneStates(['Lab 1'], { ...base, staleAfterMinutes: 1 }, noTime, now).get('Lab 1')?.status).toBe(
      'live'
    );
  });
});

describe('indexColor', () => {
  const thresholds = {
    mode: ThresholdsMode.Absolute,
    steps: [
      { value: -Infinity, color: 'blue' },
      { value: 30, color: 'green' },
      { value: 70, color: 'red' },
    ],
  };

  it('uses the user threshold steps directly in banded mode', () => {
    const config = { thresholds };
    expect(indexColor(29.9, 'banded', config, theme)).toBe(theme.visualization.getColorByName('blue'));
    expect(indexColor(30, 'banded', config, theme)).toBe(theme.visualization.getColorByName('green'));
    expect(indexColor(69, 'banded', config, theme)).toBe(theme.visualization.getColorByName('green'));
    expect(indexColor(70, 'banded', config, theme)).toBe(theme.visualization.getColorByName('red'));
  });

  it('interpolates along the continuous scheme', () => {
    const config = { color: { mode: FieldColorModeId.ContinuousBlYlRd } };
    const low = indexColor(0, 'continuous', config, theme);
    const mid = indexColor(50, 'continuous', config, theme);
    const high = indexColor(100, 'continuous', config, theme);
    expect(new Set([low, mid, high]).size).toBe(3);
    expect(indexColor(50, 'continuous', config, theme)).toBe(mid);
  });

  it('honours a fixed colour', () => {
    const config = { color: { mode: FieldColorModeId.Fixed, fixedColor: 'purple' } };
    expect(indexColor(10, 'continuous', config, theme)).toBe(theme.visualization.getColorByName('purple'));
  });

  // Grafana returns unknown colour names unchanged, and the zone fill would make the browser fetch them.
  const grey = theme.visualization.getColorByName('');
  const loaders = ["url('https://example.invalid/p.svg#paint')", "image-set('https://example.invalid/a.png' 1x)"];

  it.each(loaders)('falls back to grey for a threshold colour that loads a resource: %s', (color) => {
    const config = { thresholds: { ...thresholds, steps: [{ value: -Infinity, color }] } };
    expect(indexColor(50, 'banded', config, theme)).toBe(grey);
  });

  it.each(loaders)('falls back to grey for a fixed colour that loads a resource: %s', (fixedColor) => {
    const config = { color: { mode: FieldColorModeId.Fixed, fixedColor } };
    expect(indexColor(50, 'continuous', config, theme)).toBe(grey);
  });
});

describe('zoneVisual', () => {
  const options: Pick<FloorMapOptions, 'colorMode' | 'decimals' | 'fillOpacity'> = {
    colorMode: 'continuous',
    decimals: 1,
    fillOpacity: 0.7,
  };
  const states = computeZoneStates(
    ['Lab 1', 'Lobby', 'Store', 'Hall'],
    { ...base, staleAfterMinutes: 15 },
    readings,
    now
  );

  it('writes both metrics with units for a live zone', () => {
    const v = zoneVisual(states.get('Lab 1')!, options, {}, theme);
    expect(v).toMatchObject({
      status: 'live',
      readout: ['23.0 °C', '45.0%'],
      fillOpacity: 0.7,
      titleColor: theme.colors.text.primary,
    });
    expect(v.fill).toBeDefined();
  });

  it('shows an offline marker, a neutral fill and the error colour', () => {
    const v = zoneVisual(states.get('Store')!, options, {}, theme);
    expect(v).toMatchObject({
      readout: [OFFLINE_MARK],
      fill: theme.colors.border.strong,
      titleColor: theme.colors.error.text,
    });
  });

  it('marks stale zones like offline ones and keeps the old values with a stale marker', () => {
    const v = zoneVisual(states.get('Lobby')!, options, {}, theme);
    expect(v).toMatchObject({ readout: [STALE_MARK, '26.0 °C', '–'], titleColor: theme.colors.error.text });
    expect(v.fill).toBe(theme.colors.border.strong);
  });

  it('leaves unbound zones to the plan', () => {
    expect(zoneVisual(states.get('Hall')!, options, {}, theme)).toEqual({
      status: 'unbound',
      label: 'Hall: no sensor bound',
    });
  });

  it('follows the decimals option', () => {
    expect(zoneVisual(states.get('Lab 1')!, { ...options, decimals: 0 }, {}, theme).readout).toEqual(['23 °C', '45%']);
  });
});
