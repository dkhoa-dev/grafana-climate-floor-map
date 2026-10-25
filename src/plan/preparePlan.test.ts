import { ATTRIBUTE_PLAN, INKSCAPE_PLAN } from '../__fixtures__/plans';
import { preparePlan, READOUT_ATTR, TITLE_ATTR, ZONE_ATTR } from './preparePlan';

const marking = { labelAttribute: 'inkscape:label', zoneTag: 'zone' };
const NS = 'xmlns="http://www.w3.org/2000/svg"';

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

    // Every CSS value that makes the browser load a resource, in the places a plan can carry CSS.
    const loaders = [
      "image-set('https://example.invalid/a.png' 1x)",
      '-webkit-image-set(url(https://example.invalid/b.png) 1x)',
      "image('https://example.invalid/c.png')",
      // cross-fade( and element( are dropped whole, even with only local images inside.
      'cross-fade(url(#grad) 50%, url(#grad))',
      '-webkit-cross-fade(url(#grad), url(https://example.invalid/e.png), 50%)',
      'element(#grad)',
      "src('https://example.invalid/f.png')",
      '\\75 rl(https://example.invalid/g.png)',
      "\\69mage-set('https://example.invalid/h.png' 1x)",
      'u\\72 l(https://example.invalid/i.png)',
      "image-\\73 et('https://example.invalid/j.png' 1x)",
      'url(/**/#grad)',
    ];
    const places: Array<[string, (value: string) => string]> = [
      ['style on the root svg', (v) => `<svg ${NS} style="background-image:${v}"><rect data-zone="A"/></svg>`],
      ['style on a zone shape', (v) => `<svg ${NS}><rect data-zone="A" style="fill:${v}"/></svg>`],
      ['style on a group', (v) => `<svg ${NS}><g style="mask-image:${v}"><rect data-zone="A"/></g></svg>`],
      ...['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker-start'].map(
        (attr): [string, (value: string) => string] => [
          `${attr} attribute`,
          (v) => `<svg ${NS}><rect data-zone="A" ${attr}="${v.replace(/"/g, "'")}"/></svg>`,
        ]
      ),
    ];

    it.each(
      places.flatMap(([place, build]) =>
        loaders.map((loader): [string, string, string] => [place, loader, build(loader)])
      )
    )('drops a resource load in the %s: %s', (_place, _loader, markup) => {
      const plan = ready(markup);
      expect(plan.svg).not.toMatch(/example\.invalid|image-set|image\(|cross-fade|element\(|src\(|\\|url\(\/\*/i);
      expect(render(plan.svg).querySelector(`[${ZONE_ATTR}="A"]`)).not.toBeNull();
    });

    it('drops @import and external url() in attributes, and keeps url(#id) next to safe CSS functions', () => {
      const host = render(
        ready(`<svg ${NS}>
          <rect data-zone="A" style="fill:url(#grad);stroke:rgb(1, 2, 3);transform:translate(1px, 2px)"/>
          <rect data-zone="B" style="@import 'https://example.invalid/x.css'"/>
          <rect data-zone="C" filter="url(https://example.invalid/f.svg#blur)"/>
        </svg>`).svg
      );
      expect(host.querySelector(`[${ZONE_ATTR}="A"]`)?.getAttribute('style')).toBe(
        'fill:url(#grad);stroke:rgb(1, 2, 3);transform:translate(1px, 2px)'
      );
      expect(host.querySelector(`[${ZONE_ATTR}="B"]`)?.hasAttribute('style')).toBe(false);
      expect(host.querySelector(`[${ZONE_ATTR}="C"]`)?.hasAttribute('filter')).toBe(false);
    });

    it('accepts escapes beyond the last code point', () => {
      const host = render(ready(`<svg ${NS}><rect data-zone="A" style="font-family:'\\110000'"/></svg>`).svg);
      expect(host.querySelector(`[${ZONE_ATTR}="A"]`)?.getAttribute('style')).toBe("font-family:'\\110000'");
    });

    it.each([
      [
        'an svg:style element',
        `<svg:style xmlns:svg="http://www.w3.org/2000/svg">rect { fill: url(https://example.invalid/s.svg#p) }</svg:style>`,
      ],
      [
        'a namespaced use href',
        `<use xmlns:l="http://www.w3.org/1999/xlink" l:href="https://example.invalid/u.svg#i"/>`,
      ],
      ['a feImage href', `<filter id="f"><feImage href="https://example.invalid/fe.png"/></filter>`],
      ['a style element with @import', `<style>@import url(https://example.invalid/i.css);</style>`],
    ])('drops %s', (_name, inner) => {
      const svg = ready(`<svg ${NS}><rect data-zone="A"/>${inner}</svg>`).svg;
      expect(svg).not.toMatch(/example\.invalid/);
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
