import { loadsExternalResource } from './externalRefs';
import { listRooms, sanitizeFloorPlan, scopeIds } from './floorPlan';

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

const render = (markup: string) => {
  const host = document.createElement('div');
  host.innerHTML = sanitizeFloorPlan(markup);
  return host;
};

describe('sanitizeFloorPlan', () => {
  const hostile = `<svg ${NS} onload="alert(1)">
    <script>alert(2)</script>
    <style>body { display: none }</style>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
    <image href="https://example.invalid/x.png" width="10" height="10"/>
    <a href="javascript:alert(3)"><rect width="5" height="5"/></a>
    <rect data-room="Lobby" onclick="alert(4)" style="fill:url(https://example.invalid/p.svg#g)" width="5" height="5"/>
    <rect data-room="Hall" fill="url(#grad)" width="5" height="5"/>
    <rect data-room="Gym" width="5" height="5"><set attributeName="fill" to="url(https://example.invalid/s)"/></rect>
    <use xlink:href="https://example.invalid/sprite.svg#icon"/>
    <use href="#grad"/>
    <linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>
  </svg>`;

  it('strips scripts, handlers, foreign content, styles, images, links, animations and external references', () => {
    expect(sanitizeFloorPlan(hostile)).not.toMatch(
      /alert|<script|<style|foreignObject|<image|<a[\s>]|<set|example\.invalid|onload|onclick/i
    );
  });

  it('keeps rooms and local references', () => {
    const host = render(hostile);
    expect(listRooms(hostile)).toEqual(['Lobby', 'Hall', 'Gym']);
    expect(host.querySelector('[data-room="Hall"]')?.getAttribute('fill')).toBe('url(#grad)');
    expect(
      Array.from(host.querySelectorAll('use'), (u) => u.getAttribute('href') ?? u.getAttribute('xlink:href'))
    ).toEqual([null, '#grad']);
  });

  // Every CSS value that makes the browser load a resource, in the places a plan can carry CSS.
  const loaders = [
    "image-set('https://example.invalid/a.png' 1x)",
    '-webkit-image-set(url(https://example.invalid/b.png) 1x)',
    "image('https://example.invalid/c.png')",
    'cross-fade(url(#grad) 50%, url(#grad))',
    'element(#grad)',
    "src('https://example.invalid/f.png')",
    '\\75 rl(https://example.invalid/g.png)',
    'u\\72 l(https://example.invalid/i.png)',
    "image-\\73 et('https://example.invalid/j.png' 1x)",
    'url(/**/#grad)',
  ];
  const places: Array<[string, (value: string) => string]> = [
    ['style on the root svg', (v) => `<svg ${NS} style="background-image:${v}"><rect data-room="A"/></svg>`],
    ['style on a room', (v) => `<svg ${NS}><rect data-room="A" style="fill:${v}"/></svg>`],
    ['style on a group', (v) => `<svg ${NS}><g style="mask-image:${v}"><rect data-room="A"/></g></svg>`],
    ...['fill', 'stroke', 'filter', 'mask', 'clip-path'].map((attr): [string, (value: string) => string] => [
      `${attr} attribute`,
      (v) => `<svg ${NS}><rect data-room="A" ${attr}="${v.replace(/"/g, "'")}"/></svg>`,
    ]),
  ];

  it.each(places.flatMap(([place, build]) => loaders.map((l): [string, string, string] => [place, l, build(l)])))(
    'drops a resource load in the %s: %s',
    (_place, _loader, markup) => {
      expect(sanitizeFloorPlan(markup)).not.toMatch(
        /example\.invalid|image-set|image\(|cross-fade|element\(|src\(|\\|url\(\/\*/i
      );
      expect(listRooms(markup)).toEqual(['A']);
    }
  );

  it('keeps url(#id) next to safe CSS', () => {
    const host = render(`<svg ${NS}>
      <rect data-room="A" style="fill:url(#grad);stroke:rgb(1, 2, 3)"/>
      <rect data-room="B" style="@import 'https://example.invalid/x.css'"/>
    </svg>`);
    expect(host.querySelector('[data-room="A"]')?.getAttribute('style')).toBe('fill:url(#grad);stroke:rgb(1, 2, 3)');
    expect(host.querySelector('[data-room="B"]')?.hasAttribute('style')).toBe(false);
  });

  it('decodes escapes beyond the last code point without throwing', () => {
    expect(loadsExternalResource("'\\110000'")).toBe(false);
  });
});

describe('scopeIds', () => {
  it('prefixes ids and every reference to them', () => {
    const host = render(`<svg ${NS}>
      <defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="1" height="1"/></clipPath></defs>
      <rect data-room="A" id="room-A" style="fill: url('#g')" clip-path="url(#c)"/>
      <use xlink:href="#room-A"/>
      <rect data-room="B" fill="url(#unknown)"/>
    </svg>`);
    scopeIds(host, 'p1-');
    expect(Array.from(host.querySelectorAll('[id]'), (el) => el.id).sort()).toEqual(['p1-c', 'p1-g', 'p1-room-A']);
    const a = host.querySelector('[data-room="A"]')!;
    expect(a.getAttribute('style')).toContain("url('#p1-g')");
    expect(a.getAttribute('clip-path')).toBe('url(#p1-c)');
    expect(host.querySelector('use')?.getAttribute('xlink:href')).toBe('#p1-room-A');
    expect(host.querySelector('[data-room="B"]')?.getAttribute('fill')).toBe('url(#unknown)');
  });
});
