import { MarkingConfig, readMark } from './marking';
import { sanitizeSvg } from './sanitize';

export const ZONE_ATTR = 'data-cfm-zone';
export const TITLE_ATTR = 'data-cfm-title';
export const READOUT_ATTR = 'data-cfm-readout';

export interface ZoneSummary {
  name: string;
  shapeCount: number;
  hasTitle: boolean;
  hasReadout: boolean;
}

export type PreparedPlan =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      /** Sanitised markup, ready to insert into the page. */
      svg: string;
      /** Zones in document order of their first shape. */
      zones: ZoneSummary[];
      /** Zone names claimed by more than one shape. */
      duplicates: string[];
    };

const ROLE_ATTR = { shape: ZONE_ATTR, title: TITLE_ATTR, readout: READOUT_ATTR } as const;

function describeParseError(doc: Document): string | null {
  const error = doc.getElementsByTagName('parsererror')[0];
  if (!error) {
    return null;
  }
  const detail = (error.textContent ?? '').replace(/\s+/g, ' ').trim();
  return detail ? `The floor plan is not valid SVG: ${detail}` : 'The floor plan is not valid SVG.';
}

/** Adds a per-instance prefix to every id and to every reference to it. */
function prefixIds(root: Element, prefix: string) {
  if (!prefix) {
    return;
  }
  const ids = new Set<string>();
  root.querySelectorAll('[id]').forEach((el) => {
    ids.add(el.id);
    el.id = prefix + el.id;
  });
  if (ids.size === 0) {
    return;
  }
  const rewrite = (value: string) =>
    value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (whole, quote: string, id: string) =>
      ids.has(id) ? `url(${quote}#${prefix}${id}${quote})` : whole
    );
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')) {
        const id = attr.value.slice(1);
        if (ids.has(id)) {
          el.setAttribute(attr.name, `#${prefix}${id}`);
        }
      } else if (attr.value.includes('url(')) {
        el.setAttribute(attr.name, rewrite(attr.value));
      }
    }
  }
}

/** Makes the drawing fill its container and keep its aspect ratio. */
function fitToContainer(svg: Element) {
  if (!svg.getAttribute('viewBox')) {
    const width = parseFloat(svg.getAttribute('width') ?? '');
    const height = parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
  }
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

/**
 * Parses, marks and sanitises a floor plan. Runs only when the markup or the marking settings change.
 * `idPrefix` keeps ids unique when several panels on one dashboard show the same plan.
 */
export function preparePlan(markup: string, marking: MarkingConfig, idPrefix = ''): PreparedPlan {
  if (!markup || !markup.trim()) {
    return { kind: 'empty' };
  }
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const parseError = describeParseError(doc);
  if (parseError) {
    return { kind: 'error', message: parseError };
  }
  const source = doc.documentElement;
  if (source.localName !== 'svg') {
    return {
      kind: 'error',
      message: `The floor plan must be an SVG drawing, but its root element is <${source.localName}>.`,
    };
  }

  const zones = new Map<string, ZoneSummary>();
  const order: string[] = [];
  for (const el of Array.from(source.getElementsByTagName('*'))) {
    const mark = readMark(el, marking);
    if (!mark) {
      continue;
    }
    el.setAttribute(ROLE_ATTR[mark.role], mark.zone);
    const summary = zones.get(mark.zone) ?? { name: mark.zone, shapeCount: 0, hasTitle: false, hasReadout: false };
    if (mark.role === 'shape') {
      if (summary.shapeCount === 0) {
        order.push(mark.zone);
      }
      summary.shapeCount += 1;
    } else if (mark.role === 'title') {
      summary.hasTitle = true;
    } else {
      summary.hasReadout = true;
    }
    zones.set(mark.zone, summary);
  }

  const svg = sanitizeSvg(new XMLSerializer().serializeToString(doc));
  if (!svg) {
    return { kind: 'error', message: 'The floor plan has no drawable SVG content after removing unsafe parts.' };
  }
  prefixIds(svg, idPrefix);
  fitToContainer(svg);

  const shaped = order.map((name) => zones.get(name)!);
  return {
    kind: 'ready',
    svg: svg.outerHTML,
    zones: shaped,
    duplicates: shaped.filter((zone) => zone.shapeCount > 1).map((zone) => zone.name),
  };
}
