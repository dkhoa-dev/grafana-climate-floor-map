import Anthropic from '@anthropic-ai/sdk';
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import {
  buildRequestText,
  GenerateError,
  GenerateRequest,
  GenerateResult,
  resultFromReply,
  SYSTEM_PROMPT,
  TOO_LONG,
} from './prompt';
import { AiSettings, CLAUDE_MODEL } from './settings';

function userContent(req: GenerateRequest): ContentBlockParam[] {
  const content: ContentBlockParam[] = [];
  const a = req.attachment;
  if (a?.kind === 'image') {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: a.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        data: a.data,
      },
    });
  } else if (a?.kind === 'pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
  }
  content.push({ type: 'text', text: buildRequestText(req) });
  return content;
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The API key was rejected. Check it and try again.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'This API key is not allowed to use the model.';
  }
  if (error instanceof Anthropic.NotFoundError) {
    return 'Model or deployment not found. Check the model name.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The API rejected the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the API. Check the network, or whether a proxy or content security policy blocks it.';
  }
  if (error instanceof Anthropic.APIError) {
    return `API error ${error.status ?? ''}: ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/** Claude through the Anthropic API or a Microsoft Foundry deployment. */
export async function generateWithClaude(settings: AiSettings, req: GenerateRequest): Promise<GenerateResult> {
  const foundry = settings.provider === 'foundry';
  const apiKey = settings.keys[settings.provider]?.trim();
  // The key belongs to the person editing the panel and never leaves their browser except to the API.
  const client = foundry
    ? new AnthropicFoundry({ apiKey, resource: settings.foundryResource.trim(), dangerouslyAllowBrowser: true })
    : new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const model = (foundry ? settings.foundryModel : settings.anthropicModel).trim() || CLAUDE_MODEL;

  const base = {
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: 'high' as const },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user' as const, content: userContent(req) }],
  };
  let generated = 0;
  const onText = (delta: string) => {
    generated += delta.length;
    req.onProgress?.(generated);
  };
  const textOf = (blocks: Array<{ type: string; text?: string }>) =>
    blocks.map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join('');

  let reply: { stopReason: string | null; explanation?: string | null; text: string };
  try {
    if (foundry) {
      // Foundry has no server-side refusal fallback, so this uses the plain endpoint.
      const stream = client.messages.stream(base, { signal: req.signal });
      stream.on('text', onText);
      const m = await stream.finalMessage();
      reply = { stopReason: m.stop_reason, explanation: m.stop_details?.explanation, text: textOf(m.content) };
    } else {
      const stream = client.beta.messages.stream(
        { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        { signal: req.signal }
      );
      stream.on('text', onText);
      const m = await stream.finalMessage();
      reply = { stopReason: m.stop_reason, explanation: m.stop_details?.explanation, text: textOf(m.content) };
    }
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError || req.signal?.aborted) {
      throw e;
    }
    throw new GenerateError(describeError(e));
  }

  if (reply.stopReason === 'refusal') {
    throw new GenerateError(`The model declined this request${reply.explanation ? `: ${reply.explanation}` : '.'}`);
  }
  if (reply.stopReason === 'max_tokens') {
    throw new GenerateError(TOO_LONG);
  }
  return resultFromReply(reply.text);
}
