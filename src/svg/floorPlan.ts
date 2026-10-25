import createDOMPurify from 'dompurify';
import { loadsExternalResource } from './externalRefs';

/** Attribute the panel stamps on every room element it finds, holding the room name. */
export const ROOM_ATTR = 'data-cfm-room';

const ID_PREFIX = /^room-(.+)$/;

/** Elements that never belong in a floor plan. Animations are here because they can rewrite attributes after sanitising. */
const BLOCKED_TAGS = [
  'script',
  'foreignObject',
  'iframe',
  'style',
  'image',
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
];

// A private instance, so the hook below never affects other code on the page. Created lazily
// because this module is also imported where there is no window.
let purifier: ReturnType<typeof createDOMPurify> | undefined;

function getPurifier() {
  if (!purifier) {
    purifier = createDOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (_node, data) => {
      const name = data.attrName.toLowerCase();
      const value = data.attrValue.trim();
      if ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#')) {
        data.keepAttr = false;
      } else if (loadsExternalResource(value)) {
        data.keepAttr = false;
      }
    });
  }
  return purifier;
}

/**
 * Cleans user-supplied or generated markup down to plain drawing: no scripts, event handlers,
 * foreign content, images, links, <style> blocks (they would leak to the whole page), animations,
 * or any reference to a resource outside the document.
 */
export function sanitizeFloorPlan(markup: string): string {
  return getPurifier().sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: BLOCKED_TAGS,
    // <use> is how editors draw repeated shapes; the hook keeps only its #id references.
    ADD_TAGS: ['use'],
    ADD_ATTR: ['xlink:href'],
  });
}

const LOCAL_REF = /url\(\s*(['"]?)\s*#([^'")\s]+)\s*\1\s*\)/g;

/**
 * Prefixes every id under `root`, and every url(#id) and #id reference to it, so two panels showing
 * plans with the same ids (gradients, clip paths) on one dashboard cannot pick up each other's.
 */
export function scopeIds(root: Element, prefix: string) {
  const ids = new Set<string>();
  root.querySelectorAll('[id]').forEach((el) => {
    ids.add(el.id);
    el.id = prefix + el.id;
  });
  if (!ids.size) {
    return;
  }
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id') {
        continue;
      }
      let value = attr.value;
      if ((attr.name === 'href' || attr.name.endsWith(':href')) && ids.has(value.slice(1))) {
        value = '#' + prefix + value.slice(1);
      } else if (value.includes('url(')) {
        value = value.replace(LOCAL_REF, (match, quote: string, id: string) =>
          ids.has(id) ? `url(${quote}#${prefix}${id}${quote})` : match
        );
      }
      if (value !== attr.value) {
        el.setAttribute(attr.name, value);
      }
    }
  });
}

/** Room name of an element: `data-room` wins, then an id of the form `room-<name>`. */
export function roomNameOf(el: Element): string | undefined {
  const explicit = el.getAttribute('data-room')?.trim();
  if (explicit) {
    return explicit;
  }
  const id = el.getAttribute('id');
  const m = id ? ID_PREFIX.exec(id) : null;
  return m ? m[1].trim() : undefined;
}

/** Finds the room elements under `root`, tags them with ROOM_ATTR and returns them by name. */
export function collectRooms(root: ParentNode): Map<string, Element> {
  const rooms = new Map<string, Element>();
  root.querySelectorAll('[data-room], [id^="room-"]').forEach((el) => {
    const name = roomNameOf(el);
    if (name && !rooms.has(name)) {
      el.setAttribute(ROOM_ATTR, name);
      rooms.set(name, el);
    }
  });
  return rooms;
}

/** Room names in a floor plan, in document order. Used by the options editor, which has no rendered plan. */
export function listRooms(markup: string): string[] {
  if (!markup.trim()) {
    return [];
  }
  const doc = new DOMParser().parseFromString(sanitizeFloorPlan(markup), 'text/html');
  return Array.from(collectRooms(doc).keys());
}
