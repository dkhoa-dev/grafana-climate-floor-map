/**
 * Zone marking convention.
 *
 * In Inkscape, set an object's label (Object Properties, or double-click in the
 * Layers and Objects dialog) to the zone name followed by a tag in square brackets:
 *
 *   "Lab 1 [zone]"          the shape that gets coloured
 *   "Lab 1 [zone title]"    optional text whose colour shows online/offline
 *   "Lab 1 [zone readout]"  optional text that receives the live values
 *
 * Hand-written SVG can use attributes instead: data-zone="Lab 1",
 * data-zone-title="Lab 1" and data-zone-readout="Lab 1".
 *
 * The tag word ("zone") and the label attribute ("inkscape:label") are panel options.
 */

export type MarkRole = 'shape' | 'title' | 'readout';

export interface ZoneMark {
  zone: string;
  role: MarkRole;
}

export interface MarkingConfig {
  labelAttribute: string;
  zoneTag: string;
}

export const DEFAULT_LABEL_ATTRIBUTE = 'inkscape:label';
export const DEFAULT_ZONE_TAG = 'zone';

const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalises user input for the tag word: trimmed, lower case, letters, digits and dashes only. */
export function normaliseTag(tag: string | undefined): string {
  const cleaned = (tag ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return cleaned || DEFAULT_ZONE_TAG;
}

/** Parses a label such as "Meeting A [zone title]". Returns null when the label carries no tag. */
export function parseLabel(label: string, zoneTag: string): ZoneMark | null {
  const tag = escapeRegExp(normaliseTag(zoneTag));
  const match = new RegExp(`^(.*\\S)\\s*\\[\\s*${tag}(?:\\s+(title|readout))?\\s*\\]\\s*$`, 'i').exec(label);
  if (!match) {
    return null;
  }
  const role = (match[2]?.toLowerCase() ?? '') as '' | 'title' | 'readout';
  return { zone: match[1].trim(), role: role === '' ? 'shape' : role };
}

function readLabel(el: Element, labelAttribute: string): string | null {
  const name = labelAttribute.trim() || DEFAULT_LABEL_ATTRIBUTE;
  const direct = el.getAttribute(name);
  if (direct !== null) {
    return direct;
  }
  // Files that bind the Inkscape namespace to another prefix still count.
  if (name === DEFAULT_LABEL_ATTRIBUTE) {
    return el.getAttributeNS(INKSCAPE_NS, 'label');
  }
  return null;
}

/** Reads the zone mark from an element, from its data attributes first, then from its label. */
export function readMark(el: Element, config: MarkingConfig): ZoneMark | null {
  const tag = normaliseTag(config.zoneTag);
  const attributeRoles: Array<[string, MarkRole]> = [
    [`data-${tag}`, 'shape'],
    [`data-${tag}-title`, 'title'],
    [`data-${tag}-readout`, 'readout'],
  ];
  for (const [attribute, role] of attributeRoles) {
    const value = el.getAttribute(attribute)?.trim();
    if (value) {
      return { zone: value, role };
    }
  }
  const label = readLabel(el, config.labelAttribute);
  return label ? parseLabel(label, tag) : null;
}
