import { INKSCAPE_PLAN } from '../__fixtures__/plans';
import { preparePlan, ZONE_ATTR, READOUT_ATTR, TITLE_ATTR } from '../plan/preparePlan';
import { PlanDom, zoneFromTarget } from './planDom';
import { ZoneVisual } from './zoneStates';

function mount() {
  const plan = preparePlan(INKSCAPE_PLAN, { labelAttribute: 'inkscape:label', zoneTag: 'zone' });
  if (plan.kind !== 'ready') {
    throw new Error('plan not ready');
  }
  const host = document.createElement('div');
  host.innerHTML = plan.svg;
  return { host, dom: new PlanDom(host) };
}

const live: ZoneVisual = {
  status: 'live',
  fill: 'rgb(1, 2, 3)',
  fillOpacity: 0.5,
  titleColor: 'rgb(9, 9, 9)',
  textHalo: 'rgb(255, 255, 255)',
  readout: ['21.0 °C', '40.0%'],
  label: 'Lab 1: 21.0 °C, 40.0%',
};

describe('PlanDom', () => {
  it('colours the zone and writes the readout on two lines', () => {
    const { host, dom } = mount();
    dom.apply(new Map([['Lab 1', live]]), false);
    const shape = host.querySelector<SVGElement>(`[${ZONE_ATTR}="Lab 1"]`)!;
    expect(shape.style.fill).toBe('rgb(1, 2, 3)');
    expect(shape.style.fillOpacity).toBe('0.5');
    expect(shape.getAttribute('aria-label')).toBe('Lab 1: 21.0 °C, 40.0%');
    const readout = host.querySelector(`[${READOUT_ATTR}]`)!;
    const lines = Array.from(readout.querySelectorAll('tspan'));
    expect(lines.map((t) => t.textContent)).toEqual(['21.0 °C', '40.0%']);
    expect(lines[0].getAttribute('x')).toBe('10');
    expect(lines[1].getAttribute('dy')).toBe('1.2em');
    expect(host.querySelector<SVGElement>(`[${TITLE_ATTR}]`)!.style.fill).toBe('rgb(9, 9, 9)');
  });

  it('touches only zones whose visual changed', () => {
    const { dom } = mount();
    const unbound: ZoneVisual = { status: 'unbound', label: 'x' };
    dom.apply(
      new Map([
        ['Lab 1', live],
        ['Store B.2 (cold)', unbound],
      ]),
      false
    );
    expect(dom.lastWrites).toBe(2);
    dom.apply(
      new Map([
        ['Lab 1', { ...live }],
        ['Store B.2 (cold)', { ...unbound }],
      ]),
      false
    );
    expect(dom.lastWrites).toBe(0);
    dom.apply(
      new Map([
        ['Lab 1', { ...live, fill: 'rgb(4, 5, 6)' }],
        ['Store B.2 (cold)', unbound],
      ]),
      false
    );
    expect(dom.lastWrites).toBe(1);
  });

  it('restores the plan look when a zone loses its binding', () => {
    const { host, dom } = mount();
    const shape = host.querySelector<SVGElement>(`[${ZONE_ATTR}="Lab 1"]`)!;
    expect(shape.style.fill).toBe('#dddddd');
    dom.apply(new Map([['Lab 1', live]]), false);
    dom.apply(new Map([['Lab 1', { status: 'unbound', label: 'Lab 1: no sensor bound' }]]), false);
    expect(shape.style.fill).toBe('#dddddd');
    expect(shape.style.fillOpacity).toBe('');
    expect(host.querySelector(`[${READOUT_ATTR}]`)!.textContent).toBe('--');
  });

  it('makes zones keyboard reachable only when they are clickable', () => {
    const { host, dom } = mount();
    const shape = host.querySelector(`[${ZONE_ATTR}="Lab 1"]`)!;
    dom.apply(new Map([['Lab 1', live]]), true);
    expect(shape.getAttribute('tabindex')).toBe('0');
    expect(shape.getAttribute('role')).toBe('link');
    dom.apply(new Map([['Lab 1', live]]), false);
    expect(shape.hasAttribute('tabindex')).toBe(false);
  });

  it('colours every shape that shares a zone name', () => {
    const { host, dom } = mount();
    dom.apply(new Map([['Store B.2 (cold)', live]]), false);
    const shapes = Array.from(host.querySelectorAll<SVGElement>(`[${ZONE_ATTR}="Store B.2 (cold)"]`));
    expect(shapes.map((s) => s.style.fill)).toEqual(['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
  });
});

describe('zoneFromTarget', () => {
  it('maps shapes, titles and readout lines to their zone', () => {
    const { host } = mount();
    expect(zoneFromTarget(host.querySelector(`[${ZONE_ATTR}]`))).toBe('Lab 1');
    expect(zoneFromTarget(host.querySelector(`[${TITLE_ATTR}] tspan`))).toBe('Lab 1');
    expect(zoneFromTarget(host.querySelector('#decor'))).toBeUndefined();
    expect(zoneFromTarget(null)).toBeUndefined();
  });
});
