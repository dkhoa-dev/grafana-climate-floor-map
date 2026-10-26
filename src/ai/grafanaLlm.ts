import { EmptyError, fromEvent, lastValueFrom, takeUntil } from 'rxjs';
import { getBackendSrv } from '@grafana/runtime';
import {
  buildRequestText,
  GenerateError,
  GenerateRequest,
  GenerateResult,
  resultFromReply,
  SYSTEM_PROMPT,
  TOO_LONG,
} from './prompt';
import { LlmModel } from './settings';

const PLUGIN = '/api/plugins/grafana-llm-app';

interface Health {
  details?: {
    llmProvider?: { configured?: boolean; ok?: boolean; error?: string };
    openAI?: { configured?: boolean; ok?: boolean; error?: string };
  };
}

/** Whether the Grafana LLM app is installed and has a working provider, with a reason when not. */
export async function grafanaLlmStatus(): Promise<{ ok: boolean; message?: string }> {
  const quiet = { showSuccessAlert: false, showErrorAlert: false };
  try {
    const settings = await getBackendSrv().get(`${PLUGIN}/settings`, undefined, undefined, quiet);
    if (!settings?.enabled) {
      return { ok: false, message: 'The Grafana LLM app is installed but not enabled.' };
    }
  } catch {
    return { ok: false, message: 'The Grafana LLM app plugin is not installed.' };
  }
  try {
    const health: Health = await getBackendSrv().get(`${PLUGIN}/health`, undefined, undefined, quiet);
    const provider = health.details?.llmProvider ?? health.details?.openAI;
    if (provider?.configured && provider.ok) {
      return { ok: true };
    }
    return { ok: false, message: provider?.error ?? 'The Grafana LLM app has no working LLM provider configured.' };
  } catch {
    return { ok: false, message: 'Could not check the Grafana LLM app health.' };
  }
}

/** The LLM app's OpenAI-style chat request. It takes text only. */
export function chatRequestBody(model: LlmModel, req: GenerateRequest) {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildRequestText(req) },
    ],
  };
}

/** Asks the Grafana LLM app, which forwards to whatever provider the Grafana admin configured. */
export async function generatePlan(model: LlmModel, req: GenerateRequest): Promise<GenerateResult> {
  const request = getBackendSrv().fetch<{
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  }>({
    url: `${PLUGIN}/resources/llm/v1/chat/completions`,
    method: 'POST',
    data: chatRequestBody(model, req),
    showErrorAlert: false,
  });
  let response;
  try {
    // Unsubscribing on abort cancels the HTTP request.
    response = await lastValueFrom(req.signal ? request.pipe(takeUntil(fromEvent(req.signal, 'abort'))) : request);
  } catch (e) {
    if (e instanceof EmptyError || req.signal?.aborted) {
      throw new DOMException('Cancelled', 'AbortError');
    }
    const err = e as { status?: number; data?: { message?: string; error?: string } };
    throw new GenerateError(
      `The Grafana LLM app returned an error${err.status ? ` (${err.status})` : ''}: ${err.data?.message ?? err.data?.error ?? 'unknown error'}`
    );
  }
  const choice = response.data.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new GenerateError(TOO_LONG);
  }
  return resultFromReply(choice?.message?.content ?? '');
}

export const isAbort = (e: unknown, signal?: AbortSignal) =>
  Boolean(signal?.aborted) || (e instanceof Error && e.name === 'AbortError');

export const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));
