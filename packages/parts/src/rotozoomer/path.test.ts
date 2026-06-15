import { describe, expect, it } from 'vitest';
import { fadeLevel, INIT_PATH, ROTO_FRAMES, stepPath } from './path.js';

describe('rotozoomer path', () => {
  it('frame 0 emits the verbatim first pose and advances state', () => {
    const r = stepPath(INIT_PATH);
    expect(r.x).toBeCloseTo(-29.99, 1); // 70·sin0−30, then −= xa/16
    expect(r.y).toBeCloseTo(2.0, 1); //    70·cos0+60, then −= ya/16
    expect(r.xa).toBeCloseTo(-0.1568, 2); // −1024·sin(d2)·scale
    expect(r.ya).toBeCloseTo(2048, 0); //   1024·cos(d2)·scale (scale=2)
    expect(r.state.frame).toBe(1);
    expect(r.state.scale).toBeCloseTo(1.99, 5); // scale += scalea(−0.01)
    expect(r.state.d1).toBeCloseTo(-0.005, 5);
  });

  it('spin acceleration (d3) only starts after frame 25', () => {
    let s = INIT_PATH;
    for (let i = 0; i < 25; i++) s = stepPath(s).state;
    expect(s.d3).toBe(0); // still 0 at frame 25
    s = stepPath(s).state; // frame 25 → 26
    expect(s.d3).toBeCloseTo(0.00005, 6);
  });

  it('fadeLevel ramps in over 16 frames, holds, ramps out over the last 128', () => {
    expect(fadeLevel(0)).toBeCloseTo(0, 5);
    expect(fadeLevel(8)).toBeCloseTo(0.5, 5);
    expect(fadeLevel(16)).toBeCloseTo(1, 5);
    expect(fadeLevel(1000)).toBeCloseTo(1, 5);
    expect(fadeLevel(ROTO_FRAMES - 64)).toBeCloseTo(0.5, 5);
    expect(fadeLevel(ROTO_FRAMES)).toBeCloseTo(0, 5);
  });
});
