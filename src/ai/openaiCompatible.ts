import {
  buildRequestText,
  GenerateError,
  GenerateRequest,
  GenerateResult,
  resultFromReply,
  SYSTEM_PROMPT,
  TOO_LONG,
} from './prompt';
import { AiSettings, openAiBaseUrl } from './settings';

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatRequestBody {
  model: string;
  stream: boolean;
  messages: Array<{ role: 'system' | 'user'; content: string | ContentPart[] }>;
}

export function chatRequestBody(model: string, req: GenerateRequest, stream: boolean): ChatRequestBody {
  const text = buildRequestText(req);
  const a = req.attachment;
  if (a?.kind === 'pdf') {
    throw new GenerateError('Only Claude can read PDFs. Export the floor plan page as an image, or switch to Claude.');
  }
  const content: string | ContentPart[] =
    a?.kind === 'image'
      ? [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: `data:${a.mediaType};base64,${a.data}` } },
        ]
      : text;
  return {
    model,
    stream,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
  };
}

function headers(settings: AiSettings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = settings.keys.openai?.trim();
  if (key) {
    h.Authorization = `Bearer ${key}`;
  }
  if (settings.openAiPreset === 'openrouter') {
    // Optional attribution headers OpenRouter uses for its app rankings.
    h['HTTP-Referer'] = window.location.origin;
    h['X-Title'] = 'Climate Floor Map';
  }
  return h;
}

async function errorMessage(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? '';
  } catch {
    // Not JSON; the status line is all there is.
  }
  if (res.status === 401) {
    return 'The API key was rejected. Check it and try again.';
  }
  if (res.status === 429) {
    return 'Rate limited or out of credit. Wait a moment, or check the account balance.';
  }
  return `API error ${res.status}${detail ? `: ${detail}` : ` ${res.statusText}`}`;
}

/** Reads an OpenAI-style server-sent event stream and returns the concatenated text. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (chars: number) => void
): Promise<{ text: string; finishReason?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: string | undefined;

  const handle = (line: string) => {
    if (!line.startsWith('data:')) {
      return;
    }
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') {
      return;
    }
    const event = JSON.parse(data);
    if (event.error) {
      throw new GenerateError(`API error: ${event.error.message ?? JSON.stringify(event.error)}`);
    }
    const choice = event.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta) {
      text += delta;
      onProgress?.(text.length);
    }
    finishReason = choice?.finish_reason ?? finishReason;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffer);
  return { text, finishReason };
}

export async function generateWithOpenAi(settings: AiSettings, req: GenerateRequest): Promise<GenerateResult> {
  const body = chatRequestBody(settings.openAiModel.trim(), req, true);
  let res: Response;
  try {
    res = await fetch(`${openAiBaseUrl(settings)}/chat/completions`, {
      method: 'POST',
      headers: headers(settings),
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if (req.signal?.aborted) {
      throw e;
    }
    throw new GenerateError(
      'Could not reach the endpoint. Check the URL, and that it allows requests from the browser (CORS). DeepSeek and some self-hosted servers do not; use the Grafana LLM provider for those.'
    );
  }
  if (!res.ok || !res.body) {
    throw new GenerateError(await errorMessage(res));
  }
  const { text, finishReason } = await readChatStream(res.body, req.onProgress);
  if (finishReason === 'length') {
    throw new GenerateError(TOO_LONG);
  }
  return resultFromReply(text);
}

/** Model ids the endpoint offers, for the model picker. Empty when the endpoint has no list. */
export async function listOpenAiModels(settings: AiSettings): Promise<string[]> {
  const res = await fetch(`${openAiBaseUrl(settings)}/models`, { headers: headers(settings) });
  if (!res.ok) {
    throw new GenerateError(await errorMessage(res));
  }
  const body = await res.json();
  const ids: string[] = (body?.data ?? []).map((m: { id?: string }) => m.id).filter(Boolean);
  return ids.sort((a, b) => a.localeCompare(b));
}
