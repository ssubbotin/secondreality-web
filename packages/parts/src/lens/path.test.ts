import { describe, expect, it } from 'vitest';
import { INIT_PATH, LENS_FRAMES, type PathState, stepPath } from './path.js';

/** Run the bounce from the initial state, collecting (x,y) screen poses, for `n` frames. */
function run(n: number): { poses: Array<readonly [number, number]>; end: PathState } {
  let s = INIT_PATH;
  const poses: Array<readonly [number, number]> = [];
  for (let i = 0; i < n; i++) {
    const r = stepPath(s);
    poses.push([r.x, r.y]);
    s = r.state;
  }
  return { poses, end: s };
}

describe('lens path (MAIN.C part2 bounce)', () => {
  it('emits the initial drop trajectory verbatim', () => {
    const { poses } = run(20);
    expect(poses.slice(0, 5)).toEqual([
      [65, -50],
      [66, -49],
      [67, -47],
      [68, -46],
      [69, -45],
    ]);
    expect(poses[19]).toEqual([84, -25]);
  });

  it('bounces off the floor (y>150) with the 2/3 then 9/10 damping', () => {
    // Frame 85 is the first floor contact; ya flips to -(234*2/3) = -156.
    const { poses } = run(86);
    expect(poses[85]).toEqual([150, 146]);
  });

  it('flips horizontal velocity at the right wall (x>256)', () => {
    const { poses } = run(192);
    expect(poses[191]).toEqual([256, 64]);
  });

  it('matches reference poses at sampled frames over the full run', () => {
    const { poses } = run(720);
    expect(poses[100]).toEqual([165, 115]);
    expect(poses[200]).toEqual([249, 73]);
    expect(poses[300]).toEqual([149, 74]);
    expect(poses[714]).toEqual([131, 429]);
  });

  it('exposes the part2 frame budget', () => {
    expect(LENS_FRAMES).toBe(715);
  });
});
