import { ATTRIBUTE_PLAN, INKSCAPE_PLAN } from '../__fixtures__/plans';
import { preparePlan, READOUT_ATTR, TITLE_ATTR, ZONE_ATTR } from './preparePlan';

const marking = { labelAttribute: 'inkscape:label', zoneTag: 'zone' };

function render(svg: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = svg;
  return host;
}

function ready(markup: string, prefix = '') {
  const plan = preparePlan(markup, marking, prefix);
  if (plan.kind !== 'ready') {
    throw new Error(`expected a ready plan, got ${JSON.stringify(plan)}`);
  }
  return plan;
}

describe('preparePlan', () => {
  it('reports an empty plan', () => {
    expect(preparePlan('   ', marking)).toEqual({ kind: 'empty' });
  });

  it('names the parse error for broken markup', () => {
    const plan = preparePlan('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>', marking);
    expect(plan.kind).toBe('error');
    expect(plan.kind === 'error' && plan.message).toMatch(/not valid SVG/);
  });

  it('refuses markup whose root is not svg', () => {
    const plan = preparePlan('<html><body/></html>', marking);
    expect(plan).toEqual({ kind: 'error', message: expect.stringContaining('root element is <html>') });
  });

  it('finds zones in document order and flags duplicate names', () => {
    const plan = ready(INKSCAPE_PLAN);
    expect(plan.zones).toEqual([
      { name: 'Lab 1', shapeCount: 1, hasTitle: true, hasReadout: true },
      { name: 'Store B.2 (cold)', shapeCount: 2, hasTitle: false, hasReadout: false },
    ]);
    expect(plan.duplicates).toEqual(['Store B.2 (cold)']);
  });

  it('marks shapes, titles and readouts with panel attributes', () => {
    const host = render(ready(INKSCAPE_PLAN).svg);
    expect(host.querySelectorAll(`[${ZONE_ATTR}="Store B.2 (cold)"]`)).toHaveLength(2);
    expect(host.querySelector(`[${TITLE_ATTR}]`)?.getAttribute(TITLE_ATTR)).toBe('Lab 1');
    expect(host.querySelector(`[${READOUT_ATTR}]`)?.getAttribute(READOUT_ATTR)).toBe('Lab 1');
  });

  it('accepts data attributes and names with markup characters', () => {
    const plan = ready(ATTRIBUTE_PLAN);
    expect(plan.zones.map((z) => z.name)).toEqual(['Meeting & Focus', 'Server room', 'Lobby']);
    expect(plan.zones[1].hasReadout).toBe(true);
  });

  it('removes <title> so the browser shows no native tooltip', () => {
    expect(render(ready(INKSCAPE_PLAN).svg).querySelector('title')).toBeNull();
  });

  it('fills the container and keeps the aspect ratio', () => {
    const svg = render(ready(INKSCAPE_PLAN).svg).querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 100');
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  describe('sanitising', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
      <script>alert(2)</script>
      <style>body { display: none }</style>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
      <image href="https://example.invalid/x.png" width="10" height="10"/>
      <a href="javascript:alert(3)"><rect width="5" height="5"/></a>
      <rect data-zone="Lobby" onclick="alert(4)" style="fill:url(https://example.invalid/p.svg#g)" width="5" height="5"/>
      <rect data-zone="Hall" fill="url(#grad)" width="5" height="5"/>
      <use xlink:href="https://example.invalid/sprite.svg#icon"/>
      <use href="#grad"/>
      <linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>
    </svg>`;

    it('strips scripts, handlers, foreign content, styles, images, links and external references', () => {
      const svg = ready(hostile).svg;
      expect(svg).not.toMatch(/alert|<script|<style|foreignObject|<image|<a[\s>]|example\.invalid|onload|onclick/i);
    });

    it('keeps local references and the zones', () => {
      const host = render(ready(hostile).svg);
      expect(host.querySelectorAll(`[${ZONE_ATTR}]`)).toHaveLength(2);
      expect(host.querySelector(`[${ZONE_ATTR}="Hall"]`)?.getAttribute('fill')).toBe('url(#grad)');
      expect(
        Array.from(host.querySelectorAll('use'), (u) => u.getAttribute('href') ?? u.getAttribute('xlink:href'))
      ).toEqual([null, '#grad']);
    });
  });

  it('prefixes ids and every reference to them, so two panels never share ids', () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="1" height="1"/></clipPath></defs>
      <rect data-zone="A" id="a" style="fill: url('#g')" clip-path="url(#c)"/>
      <use xlink:href="#a"/>
      <rect data-zone="B" fill="url(#unknown)"/>
    </svg>`;
    const host = render(ready(markup, 'p1-').svg);
    expect(Array.from(host.querySelectorAll('[id]'), (el) => el.id).sort()).toEqual(['p1-a', 'p1-c', 'p1-g']);
    const a = host.querySelector(`[${ZONE_ATTR}="A"]`)!;
    expect(a.getAttribute('style')).toContain("url('#p1-g')");
    expect(a.getAttribute('clip-path')).toBe('url(#p1-c)');
    expect(host.querySelector('use')?.getAttribute('xlink:href')).toBe('#p1-a');
    expect(host.querySelector(`[${ZONE_ATTR}="B"]`)?.getAttribute('fill')).toBe('url(#unknown)');
  });
});
