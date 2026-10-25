import { normaliseTag, parseLabel, readMark } from './marking';

const svgElement = (attrs: Record<string, string>) => {
  const doc = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><rect/></svg>',
    'image/svg+xml'
  );
  const el = doc.getElementsByTagName('rect')[0];
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('inkscape:')) {
      el.setAttributeNS('http://www.inkscape.org/namespaces/inkscape', name, value);
    } else {
      el.setAttribute(name, value);
    }
  }
  return el;
};

describe('parseLabel', () => {
  it.each([
    ['Lab 1 [zone]', { zone: 'Lab 1', role: 'shape' }],
    ['Lab 1 [zone title]', { zone: 'Lab 1', role: 'title' }],
    ['Lab 1 [ZONE Readout]', { zone: 'Lab 1', role: 'readout' }],
    ['Store B.2 (cold) [zone]', { zone: 'Store B.2 (cold)', role: 'shape' }],
    ['Bay [A] [zone]', { zone: 'Bay [A]', role: 'shape' }],
    ['  Café #3   [ zone ]  ', { zone: 'Café #3', role: 'shape' }],
  ])('reads %p', (label, expected) => {
    expect(parseLabel(label, 'zone')).toEqual(expected);
  });

  it.each(['Lab 1', 'Lab 1 [zones]', '[zone]', 'Lab 1 [zone] extra', 'Lab 1 [room]'])('ignores %p', (label) => {
    expect(parseLabel(label, 'zone')).toBeNull();
  });

  it('uses a custom tag word', () => {
    expect(parseLabel('Lab 1 [area readout]', 'area')).toEqual({ zone: 'Lab 1', role: 'readout' });
    expect(parseLabel('Lab 1 [zone]', 'area')).toBeNull();
  });

  it('treats regex characters in the tag literally', () => {
    expect(normaliseTag('a.b')).toBe('ab');
    expect(normaliseTag('  ')).toBe('zone');
  });
});

describe('readMark', () => {
  const config = { labelAttribute: 'inkscape:label', zoneTag: 'zone' };

  it('reads the Inkscape label', () => {
    expect(readMark(svgElement({ 'inkscape:label': 'Lobby [zone]' }), config)).toEqual({
      zone: 'Lobby',
      role: 'shape',
    });
  });

  it('prefers data attributes over the label', () => {
    const el = svgElement({ 'data-zone-title': 'Lobby', 'inkscape:label': 'Other [zone]' });
    expect(readMark(el, config)).toEqual({ zone: 'Lobby', role: 'title' });
  });

  it('reads a configured label attribute', () => {
    const el = svgElement({ 'aria-label': 'Lobby [zone]' });
    expect(readMark(el, { labelAttribute: 'aria-label', zoneTag: 'zone' })).toEqual({ zone: 'Lobby', role: 'shape' });
    expect(readMark(el, config)).toBeNull();
  });
});
