import { createDataFrame, FieldType } from '@grafana/data';
import { parseLimits, readingsFromFrames } from './readings';

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

describe('readingsFromFrames: table layout', () => {
  const table = createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000, 1500, 3000] },
      { name: 'Device-ID', type: FieldType.string, values: ['s1', 's1', 's2', 's2'] },
      { name: 'Place', type: FieldType.string, values: ['Lab 1', 'Lab 1', 'Office A', 'Office A'] },
      { name: 'TEMPERATURE', type: FieldType.number, values: [20, 21, 22, null] },
      { name: 'Humidity', type: FieldType.number, values: [40, 41, 50, 55] },
      { name: 'temperature limit', type: FieldType.string, values: ['18-25', '18-25', '20-24', '20-24'] },
    ],
  });

  it('keeps the newest value of each metric per sensor', () => {
    const readings = readingsFromFrames([table]);
    expect(readings).toEqual([
      {
        sensor: 's1',
        location: 'Lab 1',
        time: 2000,
        temperature: 21,
        humidity: 41,
        temperatureLimits: { min: 18, max: 25 },
      },
      // The newest s2 row has no temperature, so the older one is kept.
      {
        sensor: 's2',
        location: 'Office A',
        time: 3000,
        temperature: 22,
        humidity: 55,
        temperatureLimits: { min: 20, max: 24 },
      },
    ]);
  });

  it('honours explicit field names', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'probe', type: FieldType.string, values: ['p1'] },
        { name: 'airTemp', type: FieldType.number, values: [19] },
      ],
    });
    expect(readingsFromFrames([frame], { sensor: 'probe', temperature: 'air_temp' })).toEqual([
      { sensor: 'p1', temperature: 19 },
    ]);
  });

  it('builds limits from separate min and max columns', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['a'] },
        { name: 'humidity', type: FieldType.number, values: [45] },
        { name: 'humidity_min', type: FieldType.number, values: [35] },
        { name: 'humidity_max', type: FieldType.number, values: [55] },
        { name: 'temperature_min', type: FieldType.number, values: [10] },
      ],
    });
    const [reading] = readingsFromFrames([frame]);
    expect(reading.humidityLimits).toEqual({ min: 35, max: 55 });
    // A lone min is not a band.
    expect(reading.temperatureLimits).toBeUndefined();
  });

  it('drops sensors with no temperature or humidity', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['a'] },
        { name: 'battery', type: FieldType.number, values: [80] },
      ],
    });
    expect(readingsFromFrames([frame])).toEqual([]);
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
          {
            name: '_value',
            type: FieldType.number,
            values: [44, null],
            labels: { _field: 'humidity', sensor_id: 'n1' },
          },
        ],
      }),
    ];
    expect(readingsFromFrames(frames)).toEqual([
      { sensor: 'n1', location: 'Lobby', time: 2000, temperature: 21.5, humidity: 44 },
    ]);
  });

  it('falls back to the frame name when there are no sensor labels', () => {
    const frame = createDataFrame({
      name: 'Server room',
      fields: [
        { name: 'time', type: FieldType.time, values: [5] },
        { name: 'temperature', type: FieldType.number, values: [30] },
      ],
    });
    expect(readingsFromFrames([frame])).toEqual([{ sensor: 'Server room', time: 5, temperature: 30 }]);
  });

  it('reads the location from a place label', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [5] },
        { name: 'humidity', type: FieldType.number, values: [48], labels: { device: 'd7', Place: 'Archive' } },
      ],
    });
    expect(readingsFromFrames([frame])).toEqual([{ sensor: 'd7', location: 'Archive', time: 5, humidity: 48 }]);
  });
});
