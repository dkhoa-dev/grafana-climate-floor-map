import { createDataFrame, FieldType } from '@grafana/data';
import { collectReadings, toFiniteNumber } from './readings';

describe('collectReadings: wide layout', () => {
  const wide = createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [3000, 1000, 2000, 1500] },
      { name: 'sensor_id', type: FieldType.string, values: ['sensor-01', 'sensor-01', 'sensor-02', 'sensor-02'] },
      { name: 'location', type: FieldType.string, values: ['Lab 1', 'Old name', 'Lobby', 'Lobby'] },
      { name: 'Temperature', type: FieldType.number, values: [22.5, 30, 21, 19], config: { unit: 'fahrenheit' } },
      { name: 'humidity', type: FieldType.number, values: [40, 80, null, 50] },
      { name: 'temperature_low', type: FieldType.number, values: [18, 0, NaN, NaN] },
      { name: 'temperature_high', type: FieldType.number, values: [24, 0, NaN, NaN] },
    ],
  });

  it('keeps the newest value per sensor by time, not by row order', () => {
    const readings = collectReadings([wide]);
    expect(readings.get('sensor-01')).toEqual({
      key: 'sensor-01',
      label: 'Lab 1',
      time: 3000,
      temperature: 22.5,
      humidity: 40,
      temperatureLow: 18,
      temperatureHigh: 24,
      temperatureUnit: 'fahrenheit',
    });
  });

  it('keeps an older value for a metric the newest row leaves empty', () => {
    const reading = collectReadings([wide]).get('sensor-02')!;
    expect(reading.temperature).toBe(21);
    expect(reading.humidity).toBe(50);
    expect(reading.temperatureLow).toBeUndefined();
  });

  it('lets the last row win when there is no time field', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['s1', 's1'] },
        { name: 'temperature', type: FieldType.number, values: [20, 21] },
      ],
    });
    expect(collectReadings([frame]).get('s1')).toEqual({ key: 's1', temperature: 21 });
  });

  it('merges one sensor across frames', () => {
    const a = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['s1'] },
        { name: 'temperature', type: FieldType.number, values: [20] },
      ],
    });
    const b = createDataFrame({
      fields: [
        { name: 'device', type: FieldType.string, values: ['s1'] },
        { name: 'relative_humidity', type: FieldType.number, values: [55] },
      ],
    });
    expect(collectReadings([a, b]).get('s1')).toEqual({ key: 's1', temperature: 20, humidity: 55 });
  });

  it('uses field roles chosen in the options instead of detection', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'probe', type: FieldType.string, values: ['p1'] },
        { name: 'sensor', type: FieldType.string, values: ['ignored'] },
        { name: 'c', type: FieldType.number, values: [23] },
        { name: 'temperature', type: FieldType.number, values: [99] },
      ],
    });
    expect(collectReadings([frame], { sensorKey: 'probe', temperature: 'c' })).toEqual(
      new Map([['p1', { key: 'p1', temperature: 23 }]])
    );
  });

  it('does not fall back to detection when a chosen field is missing', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['s1'] },
        { name: 'temperature', type: FieldType.number, values: [21] },
      ],
    });
    expect(collectReadings([frame], { temperature: 'nope' }).get('s1')).toEqual({ key: 's1' });
  });
});

describe('collectReadings: long layout', () => {
  it('reads a metric-name column with the sensor in series labels', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 1000, 2000, 2000] },
        { name: 'metric', type: FieldType.string, values: ['temperature', 'humidity', 'temperature', 'humidity'] },
        {
          name: 'value',
          type: FieldType.number,
          values: [20, 40, 21, 41],
          labels: { sensor: 'sensor-03', location: 'Cold store' },
        },
      ],
    });
    expect(collectReadings([frame]).get('sensor-03')).toEqual({
      key: 'sensor-03',
      label: 'Cold store',
      time: 2000,
      temperature: 21,
      humidity: 41,
    });
  });

  it('reads Flux-style series with _field in the labels', () => {
    const series = (field: string, values: number[]) =>
      createDataFrame({
        fields: [
          { name: '_time', type: FieldType.time, values: [1000, 2000] },
          {
            name: '_value',
            type: FieldType.number,
            values,
            labels: { _field: field, sensor: 'sensor-04', _measurement: 'climate' },
          },
        ],
      });
    expect(collectReadings([series('temperature', [19, 19.5]), series('humidity', [33, 34])]).get('sensor-04')).toEqual(
      {
        key: 'sensor-04',
        time: 2000,
        temperature: 19.5,
        humidity: 34,
      }
    );
  });

  it('takes the metric from the series name when no label names it', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [5] },
        { name: 'humidity', type: FieldType.number, values: [47], labels: { node: 'n7' } },
      ],
    });
    expect(collectReadings([frame]).get('n7')).toEqual({ key: 'n7', time: 5, humidity: 47 });
  });

  it('skips series without a sensor key', () => {
    const frame = createDataFrame({
      fields: [{ name: 'temperature', type: FieldType.number, values: [20] }],
    });
    expect(collectReadings([frame]).size).toBe(0);
  });
});

describe('collectReadings: precomputed index', () => {
  it('reads a ready-made index without temperature or humidity', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['s1', 's1'] },
        { name: 'ts', type: FieldType.time, values: [2, 1] },
        { name: 'status_index', type: FieldType.number, values: [64, 10] },
      ],
    });
    expect(collectReadings([frame]).get('s1')).toEqual({ key: 's1', time: 2, statusIndex: 64 });
  });
});

describe('toFiniteNumber', () => {
  it.each([
    [21.5, 21.5],
    ['21.5', 21.5],
    [NaN, undefined],
    [Infinity, undefined],
    [null, undefined],
    ['', undefined],
    ['warm', undefined],
  ])('%p → %p', (input, expected) => {
    expect(toFiniteNumber(input)).toBe(expected);
  });
});
