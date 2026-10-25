import DOMPurify from 'dompurify';

/** Attribute the panel stamps on every room element it finds, holding the room name. */
export const ROOM_ATTR = 'data-cfm-room';

const ID_PREFIX = /^room[-:](.+)$/;

/** Cleans user-supplied markup so only SVG drawing elements survive (no scripts, handlers or foreign objects). */
export function sanitizeFloorPlan(markup: string): string {
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'use'],
  });
}

/** Room name of an element: `data-room` wins, then an id of the form `room-<name>` or `room:<name>`. */
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
  root.querySelectorAll('[data-room], [id^="room-"], [id^="room:"]').forEach((el) => {
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
