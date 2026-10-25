import { GenerateError, GenerateRequest, GenerateResult } from './prompt';
import { AiSettings, capabilities, missingSetting } from './settings';

/** Sends the request to the selected provider. Each provider's client is loaded only when used. */
export async function generatePlan(settings: AiSettings, req: GenerateRequest): Promise<GenerateResult> {
  const missing = missingSetting(settings);
  if (missing) {
    throw new GenerateError(missing);
  }
  const can = capabilities(settings);
  if (req.attachment?.kind === 'pdf' && !can.pdf) {
    throw new GenerateError('Only Claude can read PDFs. Export the floor plan page as an image, or switch to Claude.');
  }
  if (req.attachment?.kind === 'image' && !can.images) {
    throw new GenerateError('This provider takes text only. Remove the image or switch provider.');
  }

  switch (settings.provider) {
    case 'anthropic':
    case 'foundry': {
      const { generateWithClaude } = await import(/* webpackChunkName: "ai-claude" */ './claude');
      return generateWithClaude(settings, req);
    }
    case 'openai': {
      const { generateWithOpenAi } = await import(/* webpackChunkName: "ai-openai" */ './openaiCompatible');
      return generateWithOpenAi(settings, req);
    }
    case 'grafana-llm': {
      const { generateWithGrafanaLlm } = await import(/* webpackChunkName: "ai-grafana-llm" */ './grafanaLlm');
      return generateWithGrafanaLlm(settings, req);
    }
  }
}

export const isAbort = (e: unknown, signal?: AbortSignal) =>
  Boolean(signal?.aborted) || (e instanceof Error && (e.name === 'AbortError' || e.name === 'APIUserAbortError'));

export function describeError(e: unknown): string {
  if (e instanceof GenerateError) {
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
