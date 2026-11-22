import { describe, expect, it } from 'vitest';
import { alignmentSnap } from '../src/canvas/geometry';

describe('выравнивание при перетаскивании', () => {
  it('ловит совпадение левых краёв', () => {
    const result = alignmentSnap(
      { x: 103, y: 300, width: 176, height: 78 },
      [{ x: 100, y: 0, width: 176, height: 78 }],
      7,
    );
    expect(result.dx).toBe(-3);
    expect(result.guides).toContainEqual({ axis: 'x', value: 100 });
  });

  it('ловит совпадение верхних краёв по вертикали', () => {
    const result = alignmentSnap(
      { x: 500, y: 105, width: 176, height: 78 },
      [{ x: 0, y: 100, width: 176, height: 78 }],
      7,
    );
    expect(result.dy).toBe(-5);
    expect(result.guides).toContainEqual({ axis: 'y', value: 100 });
  });

  it('ничего не двигает, если совпадений нет', () => {
    const result = alignmentSnap(
      { x: 0, y: 0, width: 100, height: 50 },
      [{ x: 400, y: 400, width: 100, height: 50 }],
      5,
    );
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
