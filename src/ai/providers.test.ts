import { ReadableStream } from 'stream/web';
import { chatRequestBody, readChatStream } from './openaiCompatible';
import { GenerateError } from './prompt';
import { capabilities, defaultSettings, missingSetting, openAiBaseUrl } from './settings';

const req = { instruction: 'Two rooms', dataRooms: ['Lab'] };

function sse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  }) as unknown as globalThis.ReadableStream<Uint8Array>;
}

describe('OpenAI-compatible provider', () => {
  it('sends text only when there is no image', () => {
    const body = chatRequestBody('gpt-x', req, true);
    expect(body.model).toBe('gpt-x');
    expect(body.messages[0].role).toBe('system');
    expect(typeof body.messages[1].content).toBe('string');
    expect(body.messages[1].content).toContain('<sensor_locations>\nLab');
  });

  it('sends an image as a data URL part', () => {
    const body = chatRequestBody(
      'gpt-x',
      { ...req, attachment: { kind: 'image', mediaType: 'image/png', data: 'AAAA', name: 'plan.png' } },
      false
    );
    expect(body.messages[1].content).toEqual([
      expect.objectContaining({ type: 'text' }),
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });

  it('refuses PDFs', () => {
    expect(() =>
      chatRequestBody(
        'gpt-x',
        { ...req, attachment: { kind: 'pdf', mediaType: 'application/pdf', data: 'AAAA', name: 'plan.pdf' } },
        false
      )
    ).toThrow(GenerateError);
  });

  it('reassembles a streamed reply split across chunks', async () => {
    const progress: number[] = [];
    const result = await readChatStream(
      sse([
        'data: {"choices":[{"delta":{"content":"<svg>"}}]}\n\nda',
        'ta: {"choices":[{"delta":{"content":"</svg>"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
      (n) => progress.push(n)
    );
    expect(result).toEqual({ text: '<svg></svg>', finishReason: 'stop' });
    expect(progress).toEqual([5, 11]);
  });

  it('surfaces errors sent inside the stream', async () => {
    await expect(readChatStream(sse(['data: {"error":{"message":"quota"}}\n\n']))).rejects.toThrow('quota');
  });
});

describe('settings', () => {
  it('knows what each provider can read', () => {
    const s = defaultSettings();
    expect(capabilities(s)).toEqual({ images: true, pdf: true });
    expect(capabilities({ ...s, provider: 'openai', openAiPreset: 'deepseek' })).toEqual({ images: false, pdf: false });
    expect(capabilities({ ...s, provider: 'openai', openAiPreset: 'openrouter' })).toEqual({
      images: true,
      pdf: false,
    });
    expect(capabilities({ ...s, provider: 'grafana-llm' })).toEqual({ images: false, pdf: false });
  });

  it('explains what is missing', () => {
    const s = defaultSettings();
    expect(missingSetting(s)).toMatch(/API key/);
    expect(missingSetting({ ...s, keys: { anthropic: 'k' } })).toBeUndefined();
    expect(missingSetting({ ...s, provider: 'foundry', keys: { foundry: 'k' } })).toMatch(/resource/);
    expect(missingSetting({ ...s, provider: 'openai', keys: { openai: 'k' } })).toMatch(/model/);
    expect(missingSetting({ ...s, provider: 'openai', openAiPreset: 'custom', openAiModel: 'llama' })).toMatch(
      /base URL/
    );
    expect(missingSetting({ ...s, provider: 'grafana-llm' })).toBeUndefined();
  });

  it('resolves base URLs', () => {
    const s = { ...defaultSettings(), provider: 'openai' as const };
    expect(openAiBaseUrl({ ...s, openAiPreset: 'openrouter' })).toBe('https://openrouter.ai/api/v1');
    expect(openAiBaseUrl({ ...s, openAiPreset: 'custom', openAiBaseUrl: 'http://localhost:11434/v1/' })).toBe(
      'http://localhost:11434/v1'
    );
  });
});
