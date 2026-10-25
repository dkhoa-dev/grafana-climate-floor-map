import React from 'react';
import { createDataFrame, FieldType, StandardEditorsRegistryItem } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { ATTRIBUTE_PLAN } from '../__fixtures__/plans';
import { DEFAULT_OPTIONS } from '../__fixtures__/panelProps';
import { FloorMapOptions, ZoneBindings } from '../types';
import { BindingEditor } from './BindingEditor';

const data = [
  createDataFrame({
    fields: [
      { name: 'sensor', type: FieldType.string, values: ['sensor-02', 'sensor-01'] },
      { name: 'label', type: FieldType.string, values: ['Server room', 'Lobby'] },
      { name: 'temperature', type: FieldType.number, values: [21, 22] },
    ],
  }),
];

function setup(value: ZoneBindings, options: Partial<FloorMapOptions> = {}, frames = data) {
  const onChange = jest.fn();
  render(
    <BindingEditor
      value={value}
      onChange={onChange}
      item={{} as StandardEditorsRegistryItem}
      context={{ data: frames, options: { ...DEFAULT_OPTIONS, planMarkup: ATTRIBUTE_PLAN, ...options } }}
    />
  );
  return onChange;
}

describe('BindingEditor', () => {
  it('lists one picker per zone in plan order', () => {
    setup({});
    expect(screen.getAllByRole('combobox').map((el) => el.getAttribute('aria-label'))).toEqual([
      'Sensor for Meeting & Focus',
      'Sensor for Server room',
      'Sensor for Lobby',
    ]);
  });

  it('shows a saved sensor that is missing from the data instead of an empty picker', () => {
    setup({ Lobby: 'sensor-77' });
    expect(screen.getByLabelText('Sensor for Lobby')).toHaveValue('sensor-77 (not in current data)');
  });

  it('shows the label of a bound sensor', () => {
    setup({ Lobby: 'sensor-01' });
    expect(screen.getByLabelText('Sensor for Lobby')).toHaveValue('Lobby');
  });

  it('binds zones by matching names in one action', () => {
    const onChange = setup({});
    fireEvent.click(screen.getByRole('button', { name: /Bind by matching names/ }));
    expect(onChange).toHaveBeenCalledWith({ 'Server room': 'sensor-02', Lobby: 'sensor-01' });
  });

  it('offers to remove bindings for zones that left the plan', () => {
    const onChange = setup({ Lobby: 'sensor-01', 'Old room': 'sensor-02' });
    fireEvent.click(screen.getByRole('button', { name: /Remove 1 binding for missing zones/ }));
    expect(onChange).toHaveBeenCalledWith({ Lobby: 'sensor-01' });
  });

  it('explains each empty state', () => {
    setup({}, { planMarkup: '' });
    expect(screen.getByText('Add a floor plan first.')).toBeInTheDocument();
  });

  it('explains the marking when the plan has no zones', () => {
    setup({}, { planMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' });
    expect(screen.getByText(/No zones found in the plan/)).toHaveTextContent('Name [zone]');
  });

  it('asks for a query when there is no data', () => {
    setup({}, {}, []);
    expect(screen.getByText(/Run a query that returns sensor readings/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bind by matching names/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('warns about zone names used by several shapes', () => {
    setup(
      {},
      { planMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><rect data-zone="A"/><rect data-zone="A"/></svg>' }
    );
    expect(screen.getByText(/used by more than one shape/)).toBeInTheDocument();
  });
});
