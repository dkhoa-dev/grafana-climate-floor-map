import { createTheme } from '@grafana/data';
import { buildBigPlan } from '../__fixtures__/bigPlan';
import { preparePlan } from '../plan/preparePlan';
import { SensorReading } from '../types';
import { PlanDom } from './planDom';
import { computeZoneStates, ZoneVisual, zoneVisual } from './zoneStates';

/**
 * Size check from the spec: a 1.1 MB plan with 40 zones and about 260 text spans, refreshed
 * every few seconds. jsdom is slower than a browser, so the bounds here are loose; the
 * measured numbers are recorded in docs/design-log.md.
 */
describe('large plan', () => {
  const theme = createTheme();
  const { markup, zones } = buildBigPlan();
  const options = {
    bindings: Object.fromEntries(zones.map((z, i) => [z, `s${i}`])),
    indexMode: 'position' as const,
    limits: { temperature: { low: 20, high: 26 }, humidity: { low: 30, high: 60 } },
    staleAfterMinutes: 0,
    colorMode: 'continuous' as const,
    decimals: 1,
    fillOpacity: 0.8,
  };
  const readingsAt = (step: number) =>
    new Map<string, SensorReading>(
      zones.map((_, i) => [
        `s${i}`,
        { key: `s${i}`, temperature: 20 + ((i + step * (i % 4 === 0 ? 1 : 0)) % 7), humidity: 40 },
      ])
    );
  const visualsFor = (readings: Map<string, SensorReading>) => {
    const out = new Map<string, ZoneVisual>();
    for (const [zone, state] of computeZoneStates(zones, options, readings, Date.now())) {
      out.set(zone, zoneVisual(state, options, {}, theme));
    }
    return out;
  };

  it('is as large as the spec requires', () => {
    expect(markup.length).toBeGreaterThanOrEqual(1_100_000);
    expect(markup.match(/<tspan/g)?.length).toBeGreaterThanOrEqual(260);
  });

  it('parses once and repaints only changed zones on each refresh', () => {
    const t0 = performance.now();
    const plan = preparePlan(markup, { labelAttribute: 'inkscape:label', zoneTag: 'zone' }, 'p-');
    const parseMs = performance.now() - t0;
    if (plan.kind !== 'ready') {
      throw new Error('plan not ready');
    }
    expect(plan.zones).toHaveLength(40);

    const host = document.createElement('div');
    host.innerHTML = plan.svg;
    const dom = new PlanDom(host);
    dom.apply(visualsFor(readingsAt(0)), false);
    expect(dom.lastWrites).toBe(40);

    const times: number[] = [];
    for (let step = 1; step <= 10; step++) {
      const t = performance.now();
      dom.apply(visualsFor(readingsAt(step)), false);
      times.push(performance.now() - t);
      // Only every fourth room changes its reading between refreshes.
      expect(dom.lastWrites).toBe(10);
    }
    const refreshMs = Math.max(...times);
    console.info(`large plan: parse ${parseMs.toFixed(0)} ms, slowest refresh ${refreshMs.toFixed(1)} ms`);
    expect(refreshMs).toBeLessThan(50);
  });
});
