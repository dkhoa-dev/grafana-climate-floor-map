import { buildChatPrompt, extractSvg, resultFromReply, SYSTEM_PROMPT } from './prompt';

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

describe('chat prompt', () => {
  it('puts the format rules before the request', () => {
    const prompt = buildChatPrompt({ instruction: 'Two labs', dataRooms: ['Lab 1'] });
    expect(prompt.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toContain('<sensor_locations>\nLab 1');
    expect(prompt).toContain('<instructions>\nTwo labs');
    expect(prompt).not.toContain('attached');
  });

  it('asks to trace a file the person attaches in their chat', () => {
    expect(buildChatPrompt({ instruction: '', dataRooms: [], traceAttachment: true })).toContain(
      'The attached image or PDF is a floor plan.'
    );
  });

  it('reads a pasted reply or bare SVG', () => {
    const { plan, notes } = resultFromReply(
      'Sure!\n```svg\n<svg viewBox="0 0 10 10"><rect data-room="A" width="5" height="5"/></svg>\n```'
    );
    expect(plan.shapes.map((s) => s.name)).toEqual(['A']);
    expect(notes).toBe('Sure!');
    expect(
      resultFromReply('<svg viewBox="0 0 10 10"><rect data-room="B" width="5" height="5"/></svg>').plan.shapes[0].name
    ).toBe('B');
    expect(() => resultFromReply('No drawing, sorry.')).toThrow(/did not contain an SVG/);
  });
});
