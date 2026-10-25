import { placeNear } from './ZoneTooltip';

describe('placeNear', () => {
  it('sits below and right of the pointer when there is room', () => {
    expect(placeNear(100, 100, 200, 80, 1000, 800)).toEqual({ left: 112, top: 112 });
  });

  it('flips left and up to stay inside the viewport', () => {
    expect(placeNear(950, 760, 200, 80, 1000, 800)).toEqual({ left: 738, top: 668 });
  });

  it('never goes past the top-left corner', () => {
    expect(placeNear(50, 30, 300, 100, 200, 100)).toEqual({ left: 0, top: 0 });
  });
});
