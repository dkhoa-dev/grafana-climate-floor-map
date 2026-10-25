import { InterpolateFunction } from '@grafana/data';

export interface LinkContext {
  zone: string;
  sensorKey?: string;
  sensorLabel?: string;
}

/** Tokens the panel fills in itself, in the same ${...} style as Grafana data links. */
export const LINK_TOKENS = {
  zone: '${__zone.name}',
  sensor: '${__zone.sensor}',
  label: '${__zone.label}',
} as const;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Checks a finished link. Relative links and http(s) links pass; any other scheme
 * (javascript:, data:, vbscript:, file:, ...) is refused. The browser's own URL parser
 * decides, so tricks such as "java\tscript:" are caught too.
 */
export function isSafeLink(url: string, base = window.location.href): boolean {
  if (!url.trim()) {
    return false;
  }
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url, base).protocol);
  } catch {
    return false;
  }
}

/**
 * Builds the click-through link for a zone, or returns undefined when there is no template
 * or the result is not a safe link. Zone tokens are URL-encoded first (encodeURIComponent
 * also encodes "$", so a value can never inject a dashboard variable); then Grafana
 * interpolates dashboard variables and the time range.
 */
export function buildDetailLink(
  template: string,
  context: LinkContext,
  replaceVariables: InterpolateFunction
): string | undefined {
  if (!template || !template.trim()) {
    return undefined;
  }
  const withTokens = template
    .split(LINK_TOKENS.zone)
    .join(encodeURIComponent(context.zone))
    .split(LINK_TOKENS.sensor)
    .join(encodeURIComponent(context.sensorKey ?? ''))
    .split(LINK_TOKENS.label)
    .join(encodeURIComponent(context.sensorLabel ?? context.sensorKey ?? ''));
  const url = replaceVariables(withTokens).trim();
  return isSafeLink(url) ? url : undefined;
}

export function openLink(url: string, newTab: boolean) {
  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.assign(url);
  }
}
