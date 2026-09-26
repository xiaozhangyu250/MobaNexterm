import { describe, expect, it } from 'vitest';
import { fitWindow, placeEditorWindow } from '../../src/main/windows/geometry';
const primary = { x: 0, y: 0, width: 1920, height: 1040 };
describe('display recovery', () => {
  it('recovers a window from a disconnected display', () => {
    expect(fitWindow({ x: 2100, y: 80, width: 1200, height: 800 }, [primary])).toEqual({
      x: 720,
      y: 80,
      width: 1200,
      height: 800,
    });
  });
  it('fits partially visible oversized windows after reducing resolution', () => {
    expect(fitWindow({ x: -5, y: -20, width: 2560, height: 1440 }, [primary])).toEqual(primary);
  });
  it('handles negative display coordinates without snapping to the primary', () => {
    const bounds = { x: -1400, y: 40, width: 1200, height: 800 };
    expect(fitWindow(bounds, [primary, { x: -1920, y: 0, width: 1920, height: 1080 }])).toEqual(
      bounds,
    );
  });
  it('fits screens smaller than application minimum size', () => {
    expect(fitWindow(primary, [{ x: 0, y: 0, width: 640, height: 480 }])).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
    });
  });
});

describe('editor placement', () => {
  it('centers on the invoking window on a secondary display', () => {
    expect(
      placeEditorWindow(
        { x: 2100, y: 100, width: 1280, height: 800 },
        { x: 1920, y: 0, width: 1920, height: 1040 },
      ),
    ).toEqual({ x: 2240, y: 140, width: 1000, height: 720 });
  });
  it('keeps an editor on a display left of the primary even near its edge', () => {
    expect(
      placeEditorWindow(
        { x: -300, y: 0, width: 200, height: 300 },
        { x: -1920, y: 0, width: 1920, height: 1040 },
      ),
    ).toEqual({ x: -1000, y: 0, width: 1000, height: 720 });
  });
  it('shrinks to a small work area including its top panel offset', () => {
    expect(
      placeEditorWindow(
        { x: 1920, y: 0, width: 1280, height: 800 },
        { x: 1920, y: 32, width: 800, height: 568 },
      ),
    ).toEqual({ x: 1920, y: 32, width: 800, height: 568 });
  });
});
