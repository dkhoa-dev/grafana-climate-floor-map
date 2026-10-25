import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { emptyPlan, parsePlan, PlanModel } from './model';
import { FloorPlanEditor } from './FloorPlanEditor';

// jsdom has no PointerEvent, so pointer events would lose their coordinates.
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.assign(window, { PointerEvent: PointerEventPolyfill });
}

// jsdom has no layout, so the editor maps client coordinates to plan coordinates one to one.
function setup(initial: PlanModel = emptyPlan(), dataRooms: string[] = []) {
  const onSave = jest.fn();
  render(<FloorPlanEditor initial={initial} dataRooms={dataRooms} onSave={onSave} onCancel={jest.fn()} />);
  const canvas = screen.getByTestId('floor-plan-canvas');
  const save = () => {
    fireEvent.click(screen.getByTestId('floor-plan-save'));
    return onSave.mock.calls[0][0] as PlanModel;
  };
  return { canvas, save };
}

const drag = (el: Element, from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(el, { button: 0, clientX: from[0], clientY: from[1], pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: to[0], clientY: to[1], pointerId: 1 });
};

describe('FloorPlanEditor', () => {
  it('draws a snapped rectangle and names it', () => {
    const { canvas, save } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /Rectangle/ }));
    drag(canvas, [12, 18], [118, 91]);

    const name = screen.getByTestId('floor-plan-room-name');
    fireEvent.change(name, { target: { value: 'Lab 1' } });

    expect(save().shapes).toEqual([
      expect.objectContaining({ kind: 'rect', name: 'Lab 1', x: 10, y: 20, width: 110, height: 70 }),
    ]);
  });

  it('draws a polygon by clicking corners and pressing Enter', () => {
    const { canvas, save } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /Polygon/ }));
    for (const [x, y] of [
      [0, 0],
      [100, 0],
      [100, 100],
    ]) {
      fireEvent.pointerDown(canvas, { button: 0, clientX: x, clientY: y, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: 1 });
    }
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(save().shapes[0]).toEqual(
      expect.objectContaining({
        kind: 'polygon',
        name: 'Room',
        points: [
          [0, 0],
          [100, 0],
          [100, 100],
        ],
      })
    );
  });

  it('moves the selected room by dragging, and undo restores it', () => {
    const plan = parsePlan(
      '<svg viewBox="0 0 400 200"><rect data-room="A" x="0" y="0" width="100" height="100"/></svg>'
    );
    const { canvas, save } = setup(plan);
    const room = canvas.querySelector('[data-shape-id]')!;
    drag(room, [50, 50], [83, 50]);
    expect(canvas.querySelector('[data-shape-id]')!.getAttribute('x')).toBe('30');

    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    expect(save().shapes[0]).toEqual(expect.objectContaining({ x: 0 }));
  });

  it('deletes the selected room with the Delete key', () => {
    const plan = parsePlan(
      '<svg viewBox="0 0 400 200"><rect data-room="A" x="0" y="0" width="100" height="100"/></svg>'
    );
    const { canvas, save } = setup(plan);
    fireEvent.pointerDown(canvas.querySelector('[data-shape-id]')!, {
      button: 0,
      clientX: 5,
      clientY: 5,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(save().shapes).toEqual([]);
  });

  it('adds rooms for sensor locations from the data', () => {
    const { save } = setup(emptyPlan(), ['Office', 'Lab']);
    fireEvent.click(screen.getByRole('button', { name: /Add 2 rooms from data/ }));
    expect(save().shapes.map((s) => s.name)).toEqual(['Lab', 'Office']);
  });
});
