import { describe, expect, it } from 'vitest';
import { annotationHandleAt, annotationHandlePoints, resizeAnnotationTo } from '../src/canvas/geometry';
import type { Annotation } from '../src/core/project';

const box: Annotation = {
  id: 'ann_1',
  kind: 'rect',
  layerId: 'layer_notes',
  x: 100,
  y: 50,
  width: 200,
  height: 100,
};

describe('редактирование рисунков', () => {
  it('у рамки восемь ручек', () => {
    const handles = annotationHandlePoints(box);
    expect(handles).toHaveLength(8);
    expect(handles.find((item) => item.id === 'nw')?.point).toEqual({ x: 100, y: 50 });
    expect(handles.find((item) => item.id === 'se')?.point).toEqual({ x: 300, y: 150 });
    expect(handles.find((item) => item.id === 'n')?.point).toEqual({ x: 200, y: 50 });
  });

  it('находит ручку под курсором', () => {
    expect(annotationHandleAt(box, { x: 302, y: 151 }, 5)).toBe('se');
    expect(annotationHandleAt(box, { x: 150, y: 100 }, 5)).toBeNull();
  });

  it('растягивает рамку за правый нижний угол', () => {
    const next = resizeAnnotationTo(box, 'se', { x: 360, y: 190 });
    expect(next.x).toBe(100);
    expect(next.y).toBe(50);
    expect(next.width).toBe(260);
    expect(next.height).toBe(140);
  });

  it('не даёт схлопнуть рамку меньше минимума', () => {
    const next = resizeAnnotationTo(box, 'se', { x: 0, y: 0 });
    expect(next.width).toBeGreaterThanOrEqual(12);
    expect(next.height).toBeGreaterThanOrEqual(12);
  });

  it('двигает конец линии', () => {
    const line: Annotation = {
      id: 'ann_2',
      kind: 'arrow',
      layerId: 'layer_notes',
      x: 10,
      y: 10,
      width: 100,
      height: 0,
    };
    const handles = annotationHandlePoints(line);
    expect(handles.map((item) => item.id)).toEqual(['start', 'end']);
    const next = resizeAnnotationTo(line, 'end', { x: 150, y: 40 });
    expect(next.width).toBe(140);
    expect(next.height).toBe(30);
  });
});
