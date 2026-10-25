import { extractSvg, SYSTEM_PROMPT } from './prompt';

describe('extractSvg', () => {
  it('reads a fenced SVG and keeps the surrounding text as notes', () => {
    const reply =
      'Here you go.\n```svg\n<svg viewBox="0 0 10 10"><rect data-room="A"/></svg>\n```\nI guessed the stairs.';
    expect(extractSvg(reply)).toEqual({
      svg: '<svg viewBox="0 0 10 10"><rect data-room="A"/></svg>',
      notes: 'Here you go.\n\nI guessed the stairs.',
    });
  });

  it('accepts a bare SVG', () => {
    expect(extractSvg('<svg><rect/></svg>')).toEqual({ svg: '<svg><rect/></svg>', notes: '' });
  });

  it('reports replies without a drawing', () => {
    expect(extractSvg('I cannot see a floor plan in this image.')).toEqual({
      svg: undefined,
      notes: 'I cannot see a floor plan in this image.',
    });
  });
});

describe('system prompt', () => {
  it('spells out the conventions the panel parses', () => {
    expect(SYSTEM_PROMPT).toMatch(/data-room="Room name"/);
    expect(SYSTEM_PROMPT).toMatch(/no transform attributes/);
    expect(SYSTEM_PROMPT).toMatch(/viewBox/);
  });
});
