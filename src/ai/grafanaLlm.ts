import { lastValueFrom } from 'rxjs';
import { getBackendSrv } from '@grafana/runtime';
import { chatRequestBody } from './openaiCompatible';
import { GenerateError, GenerateRequest, GenerateResult, resultFromReply, TOO_LONG } from './prompt';
import { AiSettings } from './settings';

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

/**
 * Asks the Grafana LLM app, which forwards to whatever provider the Grafana admin configured.
 * It takes text only, so attachments are refused before this is called.
 */
export async function generateWithGrafanaLlm(settings: AiSettings, req: GenerateRequest): Promise<GenerateResult> {
  if (req.attachment) {
    throw new GenerateError('The Grafana LLM app takes text only. Switch provider to trace an image.');
  }
  const body = chatRequestBody(settings.llmModel, req, false);
  let response;
  try {
    response = await lastValueFrom(
      getBackendSrv().fetch<{
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      }>({
        url: `${PLUGIN}/resources/llm/v1/chat/completions`,
        method: 'POST',
        data: body,
        showErrorAlert: false,
      })
    );
  } catch (e) {
    const err = e as { status?: number; data?: { message?: string; error?: string } };
    throw new GenerateError(
      `The Grafana LLM app returned an error${err.status ? ` (${err.status})` : ''}: ${err.data?.message ?? err.data?.error ?? 'unknown error'}`
    );
  }
  if (req.signal?.aborted) {
    throw new DOMException('Cancelled', 'AbortError');
  }
  const choice = response.data.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new GenerateError(TOO_LONG);
  }
  return resultFromReply(choice?.message?.content ?? '');
}
