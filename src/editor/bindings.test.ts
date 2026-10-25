import { bindByMatchingNames, NOT_IN_DATA, pruneBindings, sensorOptions, setBinding, sortedSensors } from './bindings';

describe('sortedSensors', () => {
  it('sorts by label then key, and keeps the order when rows arrive in another order', () => {
    const a = new Map([
      ['sensor-10', { key: 'sensor-10', label: 'Lobby' }],
      ['sensor-02', { key: 'sensor-02' }],
      ['sensor-01', { key: 'sensor-01', label: 'Lab 1' }],
      ['sensor-09', { key: 'sensor-09', label: 'lab 1' }],
    ]);
    const b = new Map(Array.from(a.entries()).reverse());
    const order = sortedSensors(a).map((s) => s.key);
    expect(order).toEqual(['sensor-01', 'sensor-09', 'sensor-10', 'sensor-02']);
    expect(sortedSensors(b).map((s) => s.key)).toEqual(order);
  });
});

describe('sensorOptions', () => {
  it('shows the label and saves the key', () => {
    expect(sensorOptions([{ key: 's1', label: 'Lab 1' }, { key: 's2' }])).toEqual([
      { value: 's1', label: 'Lab 1', description: 's1' },
      { value: 's2', label: 's2', description: undefined },
    ]);
  });

  it('keeps a saved sensor that is missing from the data, marked as such', () => {
    expect(sensorOptions([{ key: 's1' }], 's9')[0]).toEqual({ value: 's9', label: `s9 (${NOT_IN_DATA})` });
    expect(sensorOptions([{ key: 's1' }], 's1')).toHaveLength(1);
  });
});

describe('binding changes', () => {
  it('replaces or clears one zone in a single change', () => {
    expect(setBinding({ A: 's1', B: 's2' }, 'A', 's3')).toEqual({ A: 's3', B: 's2' });
    expect(setBinding({ A: 's1', B: 's2' }, 'A', null)).toEqual({ B: 's2' });
  });

  it('drops bindings of zones no longer in the plan', () => {
    expect(pruneBindings({ A: 's1', Gone: 's2' }, ['A'])).toEqual({ A: 's1' });
  });

  it('binds unbound zones to sensors whose label equals the zone name, ignoring case', () => {
    const sensors = [
      { key: 's1', label: 'lab 1' },
      { key: 's2', label: 'Lobby ' },
      { key: 's3', label: 'Lobby' },
      { key: 's4' },
      { key: 's5', label: 'Store' },
    ];
    expect(bindByMatchingNames({ Store: 'sX' }, ['Lab 1', 'Lobby', 'Store', 'Hall'], sensors)).toEqual({
      'Lab 1': 's1',
      Lobby: 's2',
      Store: 'sX',
    });
  });
});
