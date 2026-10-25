import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { parsePlan, PlanModel } from '../editor/model';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export interface Attachment {
  kind: 'image' | 'pdf';
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
  /** Base64 without the data: prefix. */
  data: string;
  name: string;
}

export interface GenerateRequest {
  apiKey: string;
  instruction: string;
  /** Existing plan to edit or convert; omitted to draw from scratch. */
  currentSvg?: string;
  attachment?: Attachment;
  /** Sensor locations from the query, so rooms can be named to auto-bind. */
  dataRooms: string[];
  model?: string;
  signal?: AbortSignal;
  onProgress?: (generatedChars: number) => void;
}

export interface GenerateResult {
  markup: string;
  plan: PlanModel;
  /** Anything the model wrote besides the SVG, e.g. assumptions it made. */
  notes: string;
}

export class GenerateError extends Error {}

export const SYSTEM_PROMPT = `You draw floor plans as SVG for a Grafana panel that colours each room by its temperature and humidity.

Output format, which the panel depends on:
- Reply with exactly one SVG document in a \`\`\`svg code block. Put any short note about assumptions after the code block, never inside the SVG.
- The root element is <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"> with no width or height attributes. Pick W and H to match the building's proportions, with the longer side between 600 and 1200 units.
- Every room is exactly one <rect> or <polygon> carrying data-room="Room name". Use absolute coordinates: no transform attributes anywhere, no nested <svg>, and no <path> for rooms. Prefer <rect>; use <polygon> only for rooms that are not rectangles (L-shapes, angled walls).
- Rooms that share a wall share the same coordinates, so there are no gaps or overlaps between neighbours.
- Do not draw room names or values as text. The panel writes them itself.
- Corridors, stairs, doors and other spaces that are not rooms may be drawn as simple shapes without data-room, with fill="none" and a thin grey stroke. Keep them few.
- Allowed elements: svg, g, rect, polygon, line, polyline, text (only for non-room labels). No scripts, event handlers, <image>, <use>, <foreignObject>, <style>, CSS classes or external references.
- Room names are short and human-readable, such as "Lab 1" or "Server room". Each name is unique.`;

function buildUserContent(req: GenerateRequest): BetaContentBlockParam[] {
  const content: BetaContentBlockParam[] = [];
  const parts: string[] = [];

  if (req.attachment?.kind === 'image') {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: req.attachment.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        data: req.attachment.data,
      },
    });
  } else if (req.attachment?.kind === 'pdf') {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: req.attachment.data },
    });
  }

  if (req.attachment) {
    parts.push(
      `The attached ${req.attachment.kind === 'pdf' ? 'PDF' : 'image'} ("${req.attachment.name}") is a floor plan. ` +
        'Trace its rooms in the output format, keeping their relative sizes and positions. Use the room labels you can read as names; name unlabelled rooms by their apparent use, or "Room 1", "Room 2" and so on.'
    );
  }
  if (req.currentSvg?.trim()) {
    parts.push(
      'This is the current plan. Start from it: keep its geometry and room names unless the instructions say otherwise, and convert anything that breaks the output format (paths, transforms, groups, ids instead of data-room, text labels on rooms).',
      '<current_plan>\n' + req.currentSvg.trim() + '\n</current_plan>'
    );
  }
  if (req.dataRooms.length) {
    parts.push(
      'The dashboard has sensors at these locations. When a room plausibly matches one, use that exact name so it binds automatically:',
      '<sensor_locations>\n' + req.dataRooms.join('\n') + '\n</sensor_locations>'
    );
  }
  parts.push('<instructions>\n' + (req.instruction.trim() || 'Produce the floor plan.') + '\n</instructions>');

  content.push({ type: 'text', text: parts.join('\n\n') });
  return content;
}

/** Pulls the SVG out of the model's reply and returns the rest as notes. */
export function extractSvg(text: string): { svg?: string; notes: string } {
  const fenced = text.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;
  const svg = source.match(/<svg[\s\S]*<\/svg>/i)?.[0];
  const notes = (fenced ? text.replace(fenced[0], '') : svg ? text.replace(svg, '') : text).trim();
  return { svg, notes };
}

export async function generatePlan(req: GenerateRequest): Promise<GenerateResult> {
  // The key comes from the person editing the panel and stays in their browser; it is never
  // written to the dashboard.
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true });

  const stream = client.beta.messages.stream(
    {
      model: req.model || DEFAULT_MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserContent(req) }],
    },
    { signal: req.signal }
  );

  let generated = 0;
  stream.on('text', (delta) => {
    generated += delta.length;
    req.onProgress?.(generated);
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new GenerateError(
      `The model declined this request${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'}`
    );
  }
  if (message.stop_reason === 'max_tokens') {
    throw new GenerateError('The plan was too large to finish. Try fewer rooms or a simpler drawing.');
  }

  const text = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const { svg, notes } = extractSvg(text);
  if (!svg) {
    throw new GenerateError(
      'The reply did not contain an SVG drawing.' + (notes ? ` It said: ${notes.slice(0, 300)}` : '')
    );
  }
  const plan = parsePlan(svg);
  if (plan.shapes.length === 0) {
    throw new GenerateError(
      'The drawing has no rooms the editor can use. Try again or describe the rooms more precisely.'
    );
  }
  return { markup: svg, plan, notes };
}

/** Turns an SDK error into a sentence for the editor. */
export function describeError(error: unknown): string {
  if (error instanceof GenerateError) {
    return error.message;
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return 'Cancelled.';
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The API key was rejected. Check it and try again.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'This API key is not allowed to use the model.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The API rejected the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Anthropic API. Check the network, or whether a proxy or content security policy blocks api.anthropic.com.';
  }
  if (error instanceof Anthropic.APIError) {
    return `API error ${error.status ?? ''}: ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : String(error);
}
