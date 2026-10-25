import { listRooms, sanitizeFloorPlan } from './floorPlan';
import { DEMO_FLOOR_PLAN } from './demoPlan';

describe('floor plan', () => {
  it('finds rooms by data-room and by id prefix, once each', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect data-room="Lab 1"/>
      <rect id="room-Office"/>
      <path id="room:Kitchen"/>
      <rect id="roomy"/>
      <rect data-room="Lab 1"/>
    </svg>`;
    expect(listRooms(svg)).toEqual(['Lab 1', 'Office', 'Kitchen']);
  });

  it('lists the demo plan rooms', () => {
    expect(listRooms(DEMO_FLOOR_PLAN)).toHaveLength(8);
  });

  it('strips scripts, handlers and foreign content', () => {
    const clean = sanitizeFloorPlan(`<svg xmlns="http://www.w3.org/2000/svg">
      <script>alert(1)</script>
      <rect data-room="A" onclick="alert(2)"/>
      <foreignObject><div>x</div></foreignObject>
    </svg>`);
    expect(clean).not.toMatch(/script|onclick|foreignObject/i);
    expect(clean).toContain('data-room="A"');
  });

  it('returns nothing for empty markup', () => {
    expect(listRooms('  ')).toEqual([]);
  });
});
