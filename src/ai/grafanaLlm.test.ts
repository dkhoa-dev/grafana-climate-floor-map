import { NEVER, of, throwError } from 'rxjs';
import { chatRequestBody, generatePlan, grafanaLlmStatus } from './grafanaLlm';
import { GenerateError } from './prompt';

const fetch = jest.fn();
const get = jest.fn();
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ fetch, get }),
}));

const req = { instruction: 'Two rooms', dataRooms: ['Lab'] };
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect data-room="Lab" width="5" height="5"/></svg>';
const reply = (content: string, finish_reason = 'stop') =>
  of({ data: { choices: [{ message: { content }, finish_reason }] } });

beforeEach(() => {
  fetch.mockReset();
  get.mockReset();
});

describe('Grafana LLM app', () => {
  it('sends the system prompt and the request as text', () => {
    const body = chatRequestBody('large', req);
    expect(body.model).toBe('large');
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages[1].content).toContain('<sensor_locations>\nLab');
  });

  it('turns the reply into a plan', async () => {
    fetch.mockReturnValue(reply('```svg\n' + SVG + '\n```\nOne room.'));
    const result = await generatePlan('base', req);
    expect(result.plan.shapes.map((s) => s.name)).toEqual(['Lab']);
    expect(result.notes).toBe('One room.');
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/plugins/grafana-llm-app/resources/llm/v1/chat/completions',
        method: 'POST',
        data: expect.objectContaining({ model: 'base' }),
      })
    );
  });

  it('explains a cut-off reply and an app error', async () => {
    fetch.mockReturnValue(reply('<svg>', 'length'));
    await expect(generatePlan('large', req)).rejects.toThrow(/too large/);
    fetch.mockReturnValue(throwError(() => ({ status: 500, data: { message: 'no provider' } })));
    await expect(generatePlan('large', req)).rejects.toThrow(
      new GenerateError('The Grafana LLM app returned an error (500): no provider')
    );
  });

  it('stops waiting when cancelled', async () => {
    fetch.mockReturnValue(NEVER);
    const controller = new AbortController();
    const pending = generatePlan('large', { ...req, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports why the app cannot be used', async () => {
    get.mockRejectedValueOnce(new Error('404'));
    expect(await grafanaLlmStatus()).toEqual({ ok: false, message: 'The Grafana LLM app plugin is not installed.' });

    get.mockResolvedValueOnce({ enabled: true }).mockResolvedValueOnce({
      details: { llmProvider: { configured: true, ok: true } },
    });
    expect(await grafanaLlmStatus()).toEqual({ ok: true });

    get.mockResolvedValueOnce({ enabled: false });
    expect((await grafanaLlmStatus()).ok).toBe(false);
  });
});
