import { describe, expect, it } from 'vitest';
import { computeContainRect, MODEX_DISPLAY_ASPECT } from './aspect.js';

describe('computeContainRect', () => {
  it('pillarboxes when the outer box is wider than the content', () => {
    // 16:9 outer (1600x900), 4:3 content -> height-limited, width 1200, centered.
    const r = computeContainRect(1600, 900, 4 / 3);
    expect(r.height).toBe(900);
    expect(r.width).toBe(1200);
    expect(r.x).toBe(200);
    expect(r.y).toBe(0);
  });

  it('letterboxes when the outer box is taller than the content', () => {
    // 1000x1000 outer, 16:9 content -> width-limited, height 562.5, centered.
    const r = computeContainRect(1000, 1000, 16 / 9);
    expect(r.width).toBe(1000);
    expect(r.height).toBeCloseTo(562.5, 4);
    expect(r.y).toBeCloseTo(218.75, 4);
    expect(r.x).toBe(0);
  });

  it('returns the outer rect unchanged when aspects match exactly', () => {
    // Boundary: outerAspect == contentAspect falls into the letterbox (<=) branch -> perfect fill.
    const r = computeContainRect(800, 600, 4 / 3); // 800/600 === 4/3
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
  });

  it('exposes the mode-X 4:3 display aspect for 320x200 buffers', () => {
    // Mode-X 320x200 was shown on a 4:3 screen -> display aspect 4/3, NOT 320/200.
    expect(MODEX_DISPLAY_ASPECT).toBeCloseTo(4 / 3, 6);
  });
});
