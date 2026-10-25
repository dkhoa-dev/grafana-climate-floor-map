import React from 'react';
import { createDataFrame, FieldType } from '@grafana/data';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ATTRIBUTE_PLAN, INKSCAPE_PLAN } from '../__fixtures__/plans';
import { panelProps } from '../__fixtures__/panelProps';
import { ZONE_ATTR } from '../plan/preparePlan';
import { PlanDom } from '../render/planDom';
import { ClimateMapPanel } from './ClimateMapPanel';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

const frame = createDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [NOW - 2 * 60000, NOW - 40 * 60000] },
    { name: 'sensor', type: FieldType.string, values: ['sensor-01', 'sensor-02'] },
    { name: 'label', type: FieldType.string, values: ['North bench', 'Server room'] },
    { name: 'temperature', type: FieldType.number, values: [26, 21] },
    { name: 'humidity', type: FieldType.number, values: [45, 33] },
  ],
});

const zone = (container: HTMLElement, name: string) =>
  Array.from(container.querySelectorAll<SVGElement>(`[${ZONE_ATTR}]`)).find(
    (el) => el.getAttribute(ZONE_ATTR) === name
  )!;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('ClimateMapPanel states', () => {
  it('asks for a plan when there is none', () => {
    render(<ClimateMapPanel {...panelProps({})} />);
    expect(screen.getByTestId('cfm-empty')).toHaveTextContent('Add a floor plan');
    expect(screen.getByRole('link', { name: /How to draw and mark a plan/ })).toHaveAttribute(
      'href',
      expect.stringContaining('#draw-and-mark-a-floor-plan')
    );
  });

  it('names the problem for invalid markup and draws nothing', () => {
    render(<ClimateMapPanel {...panelProps({ planMarkup: '<svg><rect></svg>' })} />);
    expect(screen.getByTestId('cfm-error')).toHaveTextContent('not valid SVG');
    expect(screen.queryByTestId('cfm-plan')).toBeNull();
  });

  it('draws a plan without zones and explains the marking', () => {
    render(
      <ClimateMapPanel {...panelProps({ planMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' })} />
    );
    expect(screen.getByTestId('cfm-plan').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('cfm-notice')).toHaveTextContent('[zone]');
  });

  it('says "No data" with neutral zones when there are no frames', () => {
    const { container } = render(
      <ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings: { Lobby: 'sensor-01' } })} />
    );
    expect(screen.getByTestId('cfm-notice')).toHaveTextContent('No data');
    expect(zone(container, 'Lobby').getAttribute('data-cfm-status')).toBe('offline');
  });

  it('points to the binding editor when data arrives but nothing is bound', () => {
    render(<ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN }, [frame])} />);
    expect(screen.getByTestId('cfm-notice')).toHaveTextContent('Zone bindings');
  });
});

describe('ClimateMapPanel with data', () => {
  const bindings = { 'Server room': 'sensor-01', Lobby: 'sensor-02', 'Meeting & Focus': 'sensor-09' };

  it('colours bound zones, writes readouts and marks the missing sensor offline', () => {
    const { container } = render(
      <ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings }, [frame])} />
    );
    expect(screen.queryByTestId('cfm-notice')).toBeNull();
    const server = zone(container, 'Server room');
    expect(server.getAttribute('data-cfm-status')).toBe('live');
    expect(server.style.fill).not.toBe('');
    expect(container.querySelector('[data-cfm-readout="Server room"]')?.textContent).toBe('26.0 °C45.0%');
    expect(zone(container, 'Meeting & Focus').getAttribute('data-cfm-status')).toBe('offline');
    expect(screen.getByTestId('cfm-legend')).toBeInTheDocument();
  });

  it('marks a zone stale once its reading passes the threshold, and re-checks over time', () => {
    const props = panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings, staleAfterMinutes: 41 }, [frame]);
    const { container } = render(<ClimateMapPanel {...props} />);
    expect(zone(container, 'Lobby').getAttribute('data-cfm-status')).toBe('live');
    act(() => {
      jest.advanceTimersByTime(2 * 60000);
    });
    expect(zone(container, 'Lobby').getAttribute('data-cfm-status')).toBe('stale');
    expect(zone(container, 'Server room').getAttribute('data-cfm-status')).toBe('live');
  });

  it('stops its clock on unmount', () => {
    const { unmount } = render(
      <ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings, staleAfterMinutes: 5 }, [frame])} />
    );
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('shows a tooltip with readings, bands, index and age on hover', () => {
    const { container } = render(
      <ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings }, [frame])} />
    );
    fireEvent.pointerMove(zone(container, 'Server room'), { clientX: 10, clientY: 10 });
    const tip = screen.getByTestId('cfm-tooltip');
    expect(tip).toHaveTextContent('North bench');
    expect(tip).toHaveTextContent('Sensor sensor-01');
    expect(tip).toHaveTextContent('26.0 °C');
    expect(tip).toHaveTextContent('20.0 °C to 26.0 °C (panel default)');
    expect(tip).toHaveTextContent('75 / 100');
    expect(tip).toHaveTextContent('temp. 100, hum. 50');
    expect(tip).toHaveTextContent('2026-01-15 11:58:00 (2 min ago)');
    fireEvent.pointerLeave(screen.getByTestId('cfm-plan'));
    expect(screen.queryByTestId('cfm-tooltip')).toBeNull();
  });

  it('explains offline and unbound zones in the tooltip', () => {
    const { container } = render(
      <ClimateMapPanel {...panelProps({ planMarkup: INKSCAPE_PLAN, bindings: { 'Lab 1': 'sensor-77' } }, [frame])} />
    );
    fireEvent.pointerMove(zone(container, 'Lab 1'), { clientX: 1, clientY: 1 });
    expect(screen.getByTestId('cfm-tooltip')).toHaveTextContent('No data from sensor-77');
    fireEvent.pointerMove(zone(container, 'Store B.2 (cold)'), { clientX: 1, clientY: 1 });
    expect(screen.getByTestId('cfm-tooltip')).toHaveTextContent('No sensor bound');
  });

  it('opens the detail link on click and on Enter, with tokens and variables filled in', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const props = panelProps(
      { planMarkup: ATTRIBUTE_PLAN, bindings, linkTemplate: '/d/detail?var-sensor=${__zone.sensor}&var-site=$site' },
      [frame]
    );
    props.replaceVariables = (text) => text.replace('$site', 'demo');
    const { container } = render(<ClimateMapPanel {...props} />);
    const server = zone(container, 'Server room');
    expect(server.getAttribute('tabindex')).toBe('0');
    fireEvent.click(server);
    expect(open).toHaveBeenCalledWith('/d/detail?var-sensor=sensor-01&var-site=demo', '_blank', 'noopener,noreferrer');
    fireEvent.keyDown(server, { key: 'Enter' });
    expect(open).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });

  it('does nothing on click without a link template or with an unsafe one', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const { container, rerender } = render(
      <ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings }, [frame])} />
    );
    expect(zone(container, 'Server room').hasAttribute('tabindex')).toBe(false);
    fireEvent.click(zone(container, 'Server room'));
    rerender(
      <ClimateMapPanel
        {...panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings, linkTemplate: 'javascript:alert(1)' }, [frame])}
      />
    );
    fireEvent.click(zone(container, 'Server room'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('re-applies only changed zones on a data refresh and does not re-insert the plan', () => {
    let dom: PlanDom | undefined;
    const props = panelProps({ planMarkup: ATTRIBUTE_PLAN, bindings }, [frame]);
    const { container, rerender } = render(<ClimateMapPanel {...props} onPlanApplied={(d) => (dom = d)} />);
    const svgBefore = container.querySelector('svg');
    const next = createDataFrame({
      fields: [
        { name: 'sensor', type: FieldType.string, values: ['sensor-01', 'sensor-02'] },
        { name: 'label', type: FieldType.string, values: ['North bench', 'Server room'] },
        { name: 'temperature', type: FieldType.number, values: [24, 21] },
        { name: 'humidity', type: FieldType.number, values: [45, 33] },
      ],
    });
    rerender(<ClimateMapPanel {...props} data={{ ...props.data, series: [next] }} onPlanApplied={(d) => (dom = d)} />);
    expect(container.querySelector('svg')).toBe(svgBefore);
    expect(dom?.lastWrites).toBe(1);
  });

  it('keeps ids apart for two panels showing the same plan', () => {
    const plan =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect data-zone="A" fill="url(#g)"/></svg>';
    const { container } = render(
      <>
        <ClimateMapPanel {...panelProps({ planMarkup: plan })} />
        <ClimateMapPanel {...panelProps({ planMarkup: plan })} />
      </>
    );
    const ids = Array.from(container.querySelectorAll('linearGradient'), (g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const fills = Array.from(container.querySelectorAll('rect'), (r) => r.getAttribute('fill'));
    expect(fills).toEqual(ids.map((id) => `url(#${id})`));
  });

  it('hides the legend when switched off', () => {
    render(<ClimateMapPanel {...panelProps({ planMarkup: ATTRIBUTE_PLAN, showLegend: false })} />);
    expect(screen.queryByTestId('cfm-legend')).toBeNull();
  });
});
