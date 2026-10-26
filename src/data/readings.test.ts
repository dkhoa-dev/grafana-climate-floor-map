import { createDataFrame, FieldType } from '@grafana/data';
import { limitFieldOf, parseLimits, parseMetricList, readingsFromFrames } from './readings';

describe('parseLimits', () => {
  it.each([
    ['18-30', { min: 18, max: 30 }],
    ['18.5..26', { min: 18.5, max: 26 }],
    [' 30 , 60 ', { min: 30, max: 60 }],
    ['-5 - 10', { min: -5, max: 10 }],
    ['-20--5', { min: -20, max: -5 }],
    ['30-18', { min: 18, max: 30 }],
  ])('parses %p', (input, expected) => {
    expect(parseLimits(input)).toEqual(expected);
  });

  it.each(['', 'warm', '18', 42, null])('rejects %p', (input) => {
    expect(parseLimits(input)).toBeUndefined();
  });
});

describe('limitFieldOf', () => {
  it.each([
    ['temperature_limits', { key: 'temperature', kind: 'limits' }],
    ['CO2 max', { key: 'co2', kind: 'max' }],
    ['pm2.5_min', { key: 'pm25', kind: 'min' }],
    ['rh_limit', { key: 'humidity', kind: 'limits' }],
  ])('reads %p', (name, expected) => {
    expect(limitFieldOf(name)).toEqual(expected);
  });

  it.each(['temperature', 'max', 'limits', 'co2'])('ignores %p', (name) => {
    expect(limitFieldOf(name)).toBeUndefined();
  });
});

describe('parseMetricList', () => {
  it('normalises names and resolves aliases', () => {
    expect(parseMetricList(' Temperature, CO2 ,, PM2.5, rh ')).toEqual(['temperature', 'co2', 'pm25', 'humidity']);
    expect(parseMetricList('')).toEqual([]);
  });
});

describe('readingsFromFrames: table layout', () => {
  const table = createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000, 1500, 3000] },
      { name: 'Device-ID', type: FieldType.string, values: ['s1', 's1', 's2', 's2'] },
      { name: 'Place', type: FieldType.string, values: ['Lab 1', 'Lab 1', 'Office A', 'Office A'] },
      { name: 'TEMPERATURE', type: FieldType.number, values: [20, 21, 22, null] },
      { name: 'co2', type: FieldType.number, values: [700, 1100, 500, 520] },
      { name: 'temperature limit', type: FieldType.string, values: ['18-25', '18-25', '20-24', '20-24'] },
      { name: 'co2_max', type: FieldType.number, values: [1000, 1000, null, null] },
    ],
  });

  it('turns every numeric column into a metric and keeps the newest value of each', () => {
    const { readings, metrics } = readingsFromFrames([table]);
    expect(metrics.map((m) => [m.key, m.name])).toEqual([
      ['temperature', 'Temperature'],
      ['co2', 'CO₂'],
    ]);
    expect(readings).toEqual([
      {
        sensor: 's1',
        location: 'Lab 1',
        time: 2000,
        values: {
          temperature: { value: 21, time: 2000, limits: { min: 18, max: 25 } },
          co2: { value: 1100, time: 2000, limits: { max: 1000 } },
        },
      },
      {
        sensor: 's2',
        location: 'Office A',
        time: 3000,
        // The newest s2 row has no temperature, so the older one is kept.
        values: {
          temperature: { value: 22, time: 1500, limits: { min: 20, max: 24 } },
          co2: { value: 520, time: 3000 },
        },
      },
    ]);
  });

  it('keeps only the listed metrics, in the listed order', () => {
    const { readings, metrics } = readingsFromFrames([table], {}, ['co2']);
    expect(metrics.map((m) => m.key)).toEqual(['co2']);
    expect(Object.keys(readings[0].values)).toEqual(['co2']);
    expect(readings[1].time).toBe(3000);
  });

  it('honours an explicit sensor field and ignores numeric id columns', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'probe', type: FieldType.string, values: ['p1'] },
        { name: 'id', type: FieldType.number, values: [7] },
        { name: 'noise_db', type: FieldType.number, values: [41] },
      ],
    });
    const { readings, metrics } = readingsFromFrames([frame], { sensor: 'probe' });
    expect(readings).toEqual([{ sensor: 'p1', values: { noisedb: { value: 41 } } }]);
    expect(metrics[0]).toEqual({ key: 'noisedb', name: 'Noise db', unit: undefined, decimals: undefined });
  });

  it('takes unit, decimals, display name and limits from the field config', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['a', 'b'] },
        {
          name: 'voc',
          type: FieldType.number,
          values: [300, 900],
          config: { unit: 'ppb', decimals: 0, displayName: 'TVOC', custom: { limitMax: 500 } },
        },
        { name: 'voc_max', type: FieldType.number, values: [null, 1000] },
      ],
    });
    const { readings, metrics } = readingsFromFrames([frame]);
    expect(metrics).toEqual([{ key: 'voc', name: 'TVOC', unit: 'ppb', decimals: 0 }]);
    // Limits from the data win over the field config.
    expect(readings.map((r) => r.values.voc.limits)).toEqual([{ max: 500 }, { max: 1000 }]);
  });
});

describe('readingsFromFrames: series layout', () => {
  it('reads Flux-style frames keyed by labels and merges metrics of one sensor', () => {
    const frames = [
      createDataFrame({
        fields: [
          { name: '_time', type: FieldType.time, values: [1000, 2000] },
          {
            name: '_value',
            type: FieldType.number,
            values: [20.5, 21.5],
            labels: { _field: 'temperature', sensor_id: 'n1', location: 'Lobby' },
          },
        ],
      }),
      createDataFrame({
        fields: [
          { name: '_time', type: FieldType.time, values: [1000, 2500] },
          { name: '_value', type: FieldType.number, values: [610, null], labels: { _field: 'co2', sensor_id: 'n1' } },
        ],
      }),
    ];
    const { readings, metrics } = readingsFromFrames(frames);
    expect(metrics.map((m) => m.key)).toEqual(['temperature', 'co2']);
    expect(readings).toEqual([
      {
        sensor: 'n1',
        location: 'Lobby',
        time: 2000,
        values: { temperature: { value: 21.5, time: 2000 }, co2: { value: 610, time: 1000 } },
      },
    ]);
  });

  it('names a generic value field after its frame', () => {
    const frame = createDataFrame({
      name: 'pressure',
      fields: [
        { name: 'time', type: FieldType.time, values: [5] },
        { name: 'Value', type: FieldType.number, values: [1013], labels: { sensor: 'roof' } },
      ],
    });
    expect(readingsFromFrames([frame]).readings).toEqual([
      { sensor: 'roof', time: 5, values: { pressure: { value: 1013, time: 5 } } },
    ]);
  });

  it('reads the location from a place label', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [5] },
        { name: 'humidity', type: FieldType.number, values: [48], labels: { device: 'd7', Place: 'Archive' } },
      ],
    });
    expect(readingsFromFrames([frame]).readings).toEqual([
      { sensor: 'd7', location: 'Archive', time: 5, values: { humidity: { value: 48, time: 5 } } },
    ]);
  });
});

describe('readingsFromFrames: ClickHouse time series format', () => {
  // The shape grafana-clickhouse-datasource returns in time series format: one wide frame whose
  // text columns (location, limits) have become labels on each value series.
  const labels = (sensor: string, location: string, t: string, h: string) => ({
    sensor,
    location,
    temperature_limits: t,
    humidity_limits: h,
  });
  const frame = createDataFrame({
    refId: 'A',
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      {
        name: 'temperature',
        type: FieldType.number,
        values: [26, 27.5],
        labels: labels('n-04', 'Server room', '16-28', '20-55'),
      },
      {
        name: 'humidity',
        type: FieldType.number,
        values: [37, 38],
        labels: labels('n-04', 'Server room', '16-28', '20-55'),
      },
      { name: 'temperature', type: FieldType.number, values: [22, null], labels: labels('n-01', 'Office A', '', '') },
      { name: 'humidity', type: FieldType.number, values: [45, null], labels: labels('n-01', 'Office A', '', '') },
    ],
  });

  it('reads per-sensor limits from labels and ignores empty ones', () => {
    expect(readingsFromFrames([frame]).readings).toEqual([
      {
        sensor: 'n-04',
        location: 'Server room',
        time: 2000,
        values: {
          temperature: { value: 27.5, time: 2000, limits: { min: 16, max: 28 } },
          humidity: { value: 38, time: 2000, limits: { min: 20, max: 55 } },
        },
      },
      {
        sensor: 'n-01',
        location: 'Office A',
        time: 1000,
        values: { temperature: { value: 22, time: 1000 }, humidity: { value: 45, time: 1000 } },
      },
    ]);
  });
});
