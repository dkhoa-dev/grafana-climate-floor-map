import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDataFrame, FieldType, getDefaultTimeRange, LoadingState, PanelProps } from '@grafana/data';
import { SensorFloorOptions } from '../types';
import { SensorFloorPanel, buildRoomLink, isSafeLink } from './SensorFloorPanel';

const PLAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">
  <title>should be removed</title>
  <rect data-room="Lab 1" x="0" y="0" width="100" height="100"/>
  <rect id="room-Office" x="100" y="0" width="100" height="100"/>
  <rect data-room="Attic" x="200" y="0" width="100" height="100"/>
</svg>`;

const options: SensorFloorOptions = {
  floorPlan: PLAN,
  sensorField: '',
  locationField: '',
  metrics: '',
  staleAfter: '15m',
  warningMargin: 10,
  colorBy: 'status',
  showValues: true,
  showLegend: true,
  bindings: { Office: 's2' },
  autoBind: true,
  linkUrl: '',
  linkNewTab: false,
};

function setup(overrides: Partial<SensorFloorOptions> = {}) {
  const timeRange = getDefaultTimeRange();
  const now = timeRange.to.valueOf();
  const frame = createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [now - 60_000, now - 3_600_000] },
      { name: 'sensor', type: FieldType.string, values: ['s1', 's2'] },
      { name: 'location', type: FieldType.string, values: ['Lab 1', 'Office'] },
      { name: 'temperature', type: FieldType.number, values: [22, 24] },
      { name: 'humidity', type: FieldType.number, values: [75, 40] },
      { name: 'co2', type: FieldType.number, values: [640, 500], config: { custom: { limitMax: 800 } } },
    ],
  });
  const replaceVariables = jest.fn((value: string) => value);
  const props = {
    id: 1,
    data: { series: [frame], state: LoadingState.Done, timeRange },
    timeRange,
    timeZone: 'utc',
    options: { ...options, ...overrides },
    fieldConfig: { defaults: {}, overrides: [] },
    width: 600,
    height: 300,
    transparent: false,
    renderCounter: 0,
    title: 'Floor',
    eventBus: {} as PanelProps['eventBus'],
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    onChangeTimeRange: jest.fn(),
    replaceVariables,
  } as unknown as PanelProps<SensorFloorOptions>;
  const utils = render(<SensorFloorPanel {...props} />);
  const room = (name: string) => utils.container.querySelector(`[data-sfm-room="${name}"]`)!;
  return { ...utils, room, replaceVariables };
}

describe('SensorFloorPanel', () => {
  it('marks each room with its status', () => {
    const { room, container } = setup();
    // Humidity 75 is above the 30-60 default band.
    expect(room('Lab 1').getAttribute('data-status')).toBe('alarm');
    // Bound explicitly, but the reading is an hour old.
    expect(room('Office').getAttribute('data-status')).toBe('offline');
    expect(room('Attic').getAttribute('data-status')).toBe('unbound');
    expect(container.querySelector('title')).toBeNull();
  });

  it('shows a tooltip for the hovered room', () => {
    const { room } = setup();
    fireEvent.mouseMove(room('Lab 1'), { clientX: 10, clientY: 10 });
    const tooltip = screen.getByTestId('sensor-floor-tooltip');
    expect(tooltip).toHaveTextContent('Lab 1');
    expect(tooltip).toHaveTextContent('Out of limits');
    expect(tooltip).toHaveTextContent('Humidity75.0% (out of limits) · limits 30.0% – 60.0%');
    // Unit from the well-known table, limit from the field config.
    expect(tooltip).toHaveTextContent('CO₂640 ppm · limits ≤ 800 ppm');
    fireEvent.mouseLeave(screen.getByTestId('sensor-floor-plan'));
    expect(screen.queryByTestId('sensor-floor-tooltip')).toBeNull();
  });

  it('counts rooms per status in the legend', () => {
    setup();
    expect(screen.getByTestId('sensor-floor-legend')).toHaveTextContent('Out of limits1');
  });

  it('makes bound rooms keyboard-reachable links when a URL is set', () => {
    const { room } = setup({ linkUrl: '/d/room?var-room=${room}' });
    expect(room('Lab 1').getAttribute('role')).toBe('link');
    expect(room('Attic').getAttribute('role')).toBeNull();
  });

  it('asks for a plan when none is set', () => {
    setup({ floorPlan: '' });
    expect(screen.getByText(/No plan yet. Draw one or paste SVG markup under Plan drawing/)).toBeInTheDocument();
  });
});

describe('buildRoomLink', () => {
  it('passes encoded room values as scoped variables', () => {
    const replace = jest.fn((v: string) => v);
    buildRoomLink(
      'x',
      {
        room: 'Lab 1',
        status: 'ok',
        reading: { sensor: 's/1', values: {} },
        metrics: [],
      },
      replace
    );
    expect(replace).toHaveBeenCalledWith('x', {
      room: { text: 'Lab 1', value: 'Lab%201' },
      sensor: { text: 's/1', value: 's%2F1' },
      location: { text: 'Lab 1', value: 'Lab%201' },
    });
  });
});

describe('isSafeLink', () => {
  it.each(['https://example.com/d/x', '/d/room?var-room=Lab%201', 'details?x=1'])('allows %s', (url) => {
    expect(isSafeLink(url, 'https://grafana.example/d/a')).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'java\tscript:alert(1)',
    ' JAVASCRIPT:alert(1)',
    'data:text/html,hi',
    'vbscript:x',
    '',
  ])('refuses %p', (url) => {
    expect(isSafeLink(url, 'https://grafana.example/d/a')).toBe(false);
  });
});
