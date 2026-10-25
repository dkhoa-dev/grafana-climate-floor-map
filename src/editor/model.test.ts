import { DEMO_FLOOR_PLAN } from '../svg/demoPlan';
import { listRooms } from '../svg/floorPlan';
import {
  addRoomsAsGrid,
  emptyPlan,
  parsePlan,
  parsePoints,
  serializePlan,
  shapeBounds,
  snap,
  uniqueName,
} from './model';

describe('parsePlan', () => {
  it('turns the demo plan into editable shapes and keeps the rest as static markup', () => {
    const plan = parsePlan(DEMO_FLOOR_PLAN);
    expect([plan.minX, plan.minY, plan.width, plan.height]).toEqual([0, 0, 800, 480]);
    expect(plan.shapes.map((s) => s.name)).toEqual([
      'Office A',
      'Office B',
      'Meeting room',
      'Server room',
      'Storage',
      'Lobby',
      'Lab 1',
      'Lab 2',
    ]);
    expect(plan.shapes.find((s) => s.name === 'Lobby')?.kind).toBe('polygon');
    expect(plan.staticMarkup).toContain('Corridor');
    expect(plan.staticMarkup).not.toContain('data-room');
  });

  it('leaves transformed rooms and path rooms in the static markup, where they still work as rooms', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
      <g transform="translate(10 0)"><rect data-room="Moved" width="10" height="10"/></g>
      <path id="room-Curvy" d="M0 0 L10 10"/>
      <rect id="room:Plain" x="1" y="2" width="3" height="4"/>
    </svg>`;
    const plan = parsePlan(svg);
    expect(plan.width).toBe(300);
    expect(plan.shapes).toEqual([expect.objectContaining({ name: 'Plain', x: 1, y: 2, width: 3, height: 4 })]);
    expect(listRooms(serializePlan(plan)).sort()).toEqual(['Curvy', 'Moved', 'Plain']);
  });

  it('round-trips without growing', () => {
    const once = serializePlan(parsePlan(DEMO_FLOOR_PLAN));
    const twice = serializePlan(parsePlan(once));
    expect(twice).toBe(once);
    expect(listRooms(once)).toEqual(listRooms(DEMO_FLOOR_PLAN));
  });

  it('escapes room names', () => {
    const plan = {
      ...emptyPlan(),
      shapes: [{ id: 'a', kind: 'rect' as const, name: 'R&D "lab"', x: 0, y: 0, width: 5, height: 5 }],
    };
    expect(parsePlan(serializePlan(plan)).shapes[0].name).toBe('R&D "lab"');
  });

  it('falls back to an empty canvas', () => {
    expect(parsePlan('')).toEqual(emptyPlan());
    expect(parsePlan('<div>nope</div>')).toEqual(emptyPlan());
  });
});

describe('helpers', () => {
  it('parses polygon points', () => {
    expect(parsePoints('0,0 10,0 10 10, 0 10 5')).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it('snaps and names', () => {
    expect(snap(14, 10)).toBe(10);
    expect(snap(15, 10)).toBe(20);
    expect(snap(14, 0)).toBe(14);
    expect(uniqueName('Room', ['room', 'Room 2'])).toBe('Room 3');
    expect(uniqueName('Lab', ['Room'])).toBe('Lab');
  });

  it('computes polygon bounds', () => {
    expect(
      shapeBounds({
        id: 'p',
        kind: 'polygon',
        name: 'x',
        points: [
          [10, 5],
          [30, 5],
          [20, 25],
        ],
      })
    ).toEqual({ x: 10, y: 5, width: 20, height: 20 });
  });
});

describe('addRoomsAsGrid', () => {
  it('fills an empty canvas with one room per name, in natural order', () => {
    const plan = addRoomsAsGrid(emptyPlan(), ['Lab 10', 'Lab 2', 'Office', 'Lab 1']);
    expect(plan.shapes.map((s) => s.name)).toEqual(['Lab 1', 'Lab 2', 'Lab 10', 'Office']);
    const area = plan.shapes.reduce((sum, s) => {
      const b = shapeBounds(s);
      return sum + b.width * b.height;
    }, 0);
    expect(area).toBeCloseTo(800 * 480);
  });

  it('adds only missing rooms, below the existing ones, and grows the canvas', () => {
    const base = parsePlan(DEMO_FLOOR_PLAN);
    const plan = addRoomsAsGrid(base, ['lab_1', 'Kitchen', 'Kitchen', '  ']);
    const added = plan.shapes.slice(base.shapes.length);
    expect(added.map((s) => s.name)).toEqual(['Kitchen']);
    expect(shapeBounds(added[0]).y).toBeGreaterThanOrEqual(460);
    expect(plan.height).toBeGreaterThan(base.height);
  });

  it('returns the same plan when nothing is missing', () => {
    const base = parsePlan(DEMO_FLOOR_PLAN);
    expect(addRoomsAsGrid(base, ['Lobby'])).toBe(base);
  });
});
