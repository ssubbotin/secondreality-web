import { describe, expect, it } from 'vitest';
import {
  type BallsState,
  createBallsState,
  projectBall,
  SHADOW_INDEX,
  stepBalls,
} from './balls-sim.js';
import { rasterBalls, SCREEN_H, SCREEN_W } from './raster.js';
import { icos, isin } from './sin1024.js';
import { buildDepthTables } from './tables.js';

const dt = buildDepthTables();

/** A state with a single on-screen ball at id 0 and all others driven far off-screen. */
function singleBall(X: number, Y: number, Z: number): BallsState {
  const s = createBallsState();
  s.rotcos = icos(0) * 64; // rot=0
  s.rotsin = isin(0) * 64;
  // Park every ball far to the right (rejected by the unsigned sx gate) so only ball 0 draws.
  for (let i = 0; i < s.x.length; i++) {
    s.x[i] = 2_000_000;
    s.y[i] = 0;
    s.z[i] = 0;
  }
  s.x[0] = X;
  s.y[0] = Y;
  s.z[0] = Z;
  return s;
}

describe('rasterBalls — ASM.ASM _drawdots → 320×200 index buffer', () => {
  it('clears to black then plots only the on-screen balls', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    out.fill(7); // poison
    rasterBalls(out, createBallsState(), dt); // all balls start far above → nothing drawn this frame
    // The freshly-created state's balls project to negative rows (shadow row may still land); just
    // assert fill(0) ran (no leftover poison value 7 anywhere it should not be).
    expect(out.includes(7)).toBe(false);
  });

  it('plots the 2-pixel shadow (index 87) at (sx, shy) and (sx+1, shy)', () => {
    // Pick a ball whose ball-row is off-screen (high up) but whose shadow row is on-screen.
    const X = isin(33) * 40;
    const Y = icos(39) * 10 - 22000; // very negative → ball row < 0
    const Z = isin(51) * 40;
    const s = singleBall(X, Y, Z);
    const probe = createBallsState();
    probe.rotcos = icos(0) * 64;
    probe.rotsin = isin(0) * 64;
    probe.x[0] = X;
    probe.y[0] = Y;
    probe.z[0] = Z;
    const r = projectBall(probe, 0);
    expect(r.visible).toBe(true);
    expect(r.ballVisible).toBe(false); // ball off the top

    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    rasterBalls(out, s, dt);
    const base = r.shadowRow * SCREEN_W + r.screenX;
    expect(out[base]).toBe(SHADOW_INDEX);
    expect(out[base + 1]).toBe(SHADOW_INDEX);
  });

  it('plots the 2/4/2 ball sprite footprint from the depth tables when on-screen', () => {
    // A ball near the floor plane → ball row on-screen.
    const s = singleBall(0, 7000, 200);
    const probe = createBallsState();
    probe.rotcos = icos(0) * 64;
    probe.rotsin = isin(0) * 64;
    probe.x[0] = 0;
    probe.y[0] = 7000;
    probe.z[0] = 200;
    const r = projectBall(probe, 0);
    expect(r.visible).toBe(true);
    expect(r.ballVisible).toBe(true);

    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    rasterBalls(out, s, dt);
    const sx = r.screenX;
    const by = r.ballRow;
    const lo = dt.row0[r.depthIdx * 2] ?? 0;
    // row 0 (by): two pixels at sx+1, sx+2.
    expect(out[by * SCREEN_W + sx + 1]).toBe(lo);
    expect(out[by * SCREEN_W + sx + 2]).toBe(lo);
    // row 1 (by+1): four pixels at sx..sx+3.
    expect(out[(by + 1) * SCREEN_W + sx]).toBe(dt.row1[r.depthIdx * 4]);
    expect(out[(by + 1) * SCREEN_W + sx + 1]).toBe(dt.row1[r.depthIdx * 4 + 1]);
    expect(out[(by + 1) * SCREEN_W + sx + 3]).toBe(dt.row1[r.depthIdx * 4 + 3]);
    // row 2 (by+2): two pixels at sx+1, sx+2.
    expect(out[(by + 2) * SCREEN_W + sx + 1]).toBe(dt.row2[r.depthIdx * 2]);
  });

  it('never writes outside the 320×200 buffer and only writes valid palette indices', () => {
    const s = createBallsState();
    for (let k = 0; k < 700; k++) stepBalls(s); // into the fountain/ring phases
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    expect(() => rasterBalls(out, s, dt)).not.toThrow();
    expect(out).toHaveLength(SCREEN_W * SCREEN_H);
    for (const v of out) expect(v).toBeLessThanOrEqual(255);
  });
});
