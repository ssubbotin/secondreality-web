import { describe, expect, it } from 'vitest';
import { centerOffset, SCREEN_W } from './layout.js';

describe('centerOffset (MAIN.C tstart=(639-width)/2)', () => {
  it('centres a narrow line around column 319.5', () => {
    expect(SCREEN_W).toBe(640);
    // width 0 → (639-0)/2 = 319 (trunc).
    expect(centerOffset(0)).toBe(319);
    // width 100 → (639-100)/2 = 269 (trunc of 269.5).
    expect(centerOffset(100)).toBe(269);
    // width 137 ('Here goes:') → (639-137)/2 = 251.
    expect(centerOffset(137)).toBe(251);
  });

  it('truncates toward zero exactly as C integer division does', () => {
    // (639-1)/2 = 319 (638/2).
    expect(centerOffset(1)).toBe(319);
    // (639-2)/2 = 318 (trunc of 318.5).
    expect(centerOffset(2)).toBe(318);
  });

  it('yields a negative (left-clipping) offset for over-wide lines', () => {
    // width 700 → (639-700)/2 = -61/2 = -30 (trunc toward zero, not floor).
    expect(centerOffset(700)).toBe(-30);
  });
});
