import { normalizeName } from '../data/readings';
import { roomNameOf, sanitizeFloorPlan } from '../svg/floorPlan';

export type Point = [number, number];

interface ShapeBase {
  id: string;
  name: string;
}

export interface RectShape extends ShapeBase {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonShape extends ShapeBase {
  kind: 'polygon';
  points: Point[];
}

export type Shape = RectShape | PolygonShape;

/**
 * An editable floor plan. Rooms drawn as plain rects or polygons become shapes; everything
 * else in the markup (walls, labels, rooms drawn as paths) is kept verbatim as static content.
 */
export interface PlanModel {
  minX: number;
  minY: number;
  width: number;
  height: number;
  shapes: Shape[];
  staticMarkup: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 480;
const STATIC_ATTR = 'data-sfm-static';

let nextId = 0;
export const newId = () => `s${++nextId}`;

export const emptyPlan = (): PlanModel => ({
  minX: 0,
  minY: 0,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  shapes: [],
  staticMarkup: '',
});

const num = (value: string | null | undefined) => {
  const n = value === null || value === undefined ? NaN : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
};

export function parsePoints(value: string | null): Point[] {
  const nums = (value ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const points: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
      points.push([nums[i], nums[i + 1]]);
    }
  }
  return points;
}

/** Shapes under a transform cannot be edited in plain coordinates, so they stay static. */
const isTransformed = (el: Element, root: Element) => {
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    if (n.hasAttribute('transform')) {
      return true;
    }
  }
  return false;
};

const removeEmptyGroups = (root: Element) => {
  root.querySelectorAll('g').forEach((g) => {
    if (g.children.length === 0 && !g.textContent?.trim()) {
      g.remove();
    }
  });
};

export function parsePlan(markup: string): PlanModel {
  if (!markup.trim()) {
    return emptyPlan();
  }
  const doc = new DOMParser().parseFromString(sanitizeFloorPlan(markup), 'text/html');
  const svg = doc.querySelector('svg');
  if (!svg) {
    return emptyPlan();
  }

  const plan = emptyPlan();
  const viewBox = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    [plan.minX, plan.minY, plan.width, plan.height] = viewBox;
  } else {
    plan.width = num(svg.getAttribute('width')) ?? DEFAULT_WIDTH;
    plan.height = num(svg.getAttribute('height')) ?? DEFAULT_HEIGHT;
  }

  // Unwrap static content saved by an earlier edit so it does not nest deeper on every save.
  svg.querySelectorAll(`g[${STATIC_ATTR}]`).forEach((g) => g.replaceWith(...Array.from(g.childNodes)));

  svg.querySelectorAll('rect, polygon').forEach((el) => {
    const name = roomNameOf(el);
    if (!name || isTransformed(el, svg)) {
      return;
    }
    if (el.tagName.toLowerCase() === 'rect') {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((a) => num(el.getAttribute(a)));
      if (width === undefined || height === undefined || width <= 0 || height <= 0) {
        return;
      }
      plan.shapes.push({ id: newId(), kind: 'rect', name, x: x ?? 0, y: y ?? 0, width, height });
    } else {
      const points = parsePoints(el.getAttribute('points'));
      if (points.length < 3) {
        return;
      }
      plan.shapes.push({ id: newId(), kind: 'polygon', name, points });
    }
    el.remove();
  });

  removeEmptyGroups(svg);
  plan.staticMarkup = svg.innerHTML.trim();
  return plan;
}

const round = (n: number) => Math.round(n * 100) / 100;

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function serializePlan(plan: PlanModel): string {
  const shapes = plan.shapes.map((s) => {
    const name = escapeAttr(s.name);
    if (s.kind === 'rect') {
      return `    <rect data-room="${name}" x="${round(s.x)}" y="${round(s.y)}" width="${round(s.width)}" height="${round(s.height)}"/>`;
    }
    const points = s.points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
    return `    <polygon data-room="${name}" points="${points}"/>`;
  });
  const viewBox = [plan.minX, plan.minY, plan.width, plan.height].map(round).join(' ');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    ...(plan.staticMarkup ? [`  <g ${STATIC_ATTR}="">${plan.staticMarkup}</g>`] : []),
    `  <g fill="#cfd6de" fill-opacity="0.35" stroke="#5c6670" stroke-width="3" stroke-linejoin="round">`,
    ...shapes,
    '  </g>',
    '</svg>',
  ].join('\n');
}

export function shapeBounds(shape: Shape): Bounds {
  if (shape.kind === 'rect') {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  const xs = shape.points.map((p) => p[0]);
  const ys = shape.points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function translateShape<T extends Shape>(shape: T, dx: number, dy: number): T {
  if (shape.kind === 'rect') {
    return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
  return { ...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy] as Point) };
}

/** Rect from two corners, in any order. */
export function rectFromCorners(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    width: Math.abs(a[0] - b[0]),
    height: Math.abs(a[1] - b[1]),
  };
}

export const snap = (value: number, grid: number) => (grid > 0 ? Math.round(value / grid) * grid : value);

/** "Room", "Room 2", "Room 3", ... skipping names already taken. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, normalizeName));
  if (!used.has(normalizeName(base))) {
    return base;
  }
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(normalizeName(candidate))) {
      return candidate;
    }
  }
}

const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Adds a room for every name not already in the plan, laid out as a grid.
 * An empty plan is filled edge to edge; otherwise new rooms go in rows below the existing ones.
 */
export function addRoomsAsGrid(plan: PlanModel, names: string[], cell = { width: 160, height: 120 }): PlanModel {
  const existing = new Set(plan.shapes.map((s) => normalizeName(s.name)));
  const fresh: string[] = [];
  for (const name of [...names].sort(naturalSort)) {
    const key = normalizeName(name);
    if (name.trim() && !existing.has(key)) {
      existing.add(key);
      fresh.push(name.trim());
    }
  }
  if (fresh.length === 0) {
    return plan;
  }

  const blank = plan.shapes.length === 0 && !plan.staticMarkup.trim();
  if (blank) {
    // Pick the column count whose cells come closest to the default cell's proportions.
    const cols = Math.max(
      1,
      Math.round(Math.sqrt((fresh.length * plan.width * cell.height) / (plan.height * cell.width)))
    );
    const rows = Math.ceil(fresh.length / cols);
    const w = plan.width / cols;
    const h = plan.height / rows;
    const shapes: Shape[] = fresh.map((name, i) => ({
      id: newId(),
      kind: 'rect',
      name,
      x: plan.minX + (i % cols) * w,
      y: plan.minY + Math.floor(i / cols) * h,
      width: w,
      height: h,
    }));
    return { ...plan, shapes };
  }

  const bottom = Math.max(
    plan.minY,
    ...plan.shapes.map((s) => {
      const b = shapeBounds(s);
      return b.y + b.height;
    })
  );
  const gap = cell.height / 4;
  const cols = Math.max(1, Math.floor(plan.width / cell.width));
  const top = bottom + gap;
  const added: Shape[] = fresh.map((name, i) => ({
    id: newId(),
    kind: 'rect',
    name,
    x: plan.minX + (i % cols) * cell.width,
    y: top + Math.floor(i / cols) * cell.height,
    width: cell.width,
    height: cell.height,
  }));
  const rows = Math.ceil(fresh.length / cols);
  const needed = top + rows * cell.height - plan.minY;
  return { ...plan, height: Math.max(plan.height, needed), shapes: [...plan.shapes, ...added] };
}
