import { describe, expect, it } from 'vitest';
import {
  type BallsState,
  createBallsState,
  DOTNUM,
  GRAVITY_BOTTOM,
  projectBall,
  stepBalls,
} from './balls-sim.js';
import { icos, isin } from './sin1024.js';
import { asr, depthElement, idiv } from './tables.js';

describe('createBallsState', () => {
  it('seeds 512 balls at (0, 2560−dropper, 0) and a permuted round-robin order', () => {
    const s = createBallsState();
    expect(s.x).toHaveLength(DOTNUM);
    expect(s.y[0]).toBe(2560 - 22000);
    expect(s.z[0]).toBe(0);
    // The order table is a permutation of 0..511 (scrambled, deterministic for a fixed seed).
    const seen = new Set(Array.from(s.order));
    expect(seen.size).toBe(DOTNUM);
    expect(Math.min(...s.order)).toBe(0);
    expect(Math.max(...s.order)).toBe(DOTNUM - 1);
  });
});

describe('stepBalls — the MAIN.C phase machine + camera spin', () => {
  it('swirl phase (frame<500): positions the repositioned ball with the Lissajous formula', () => {
    const s = createBallsState();
    const target = s.order[0] ?? 0; // tick 1 repositions order[0]
    stepBalls(s);
    expect(s.frame).toBe(1);
    // f was 0 during the position write (f++ happens after). dropper still 22000 at write time.
    expect(s.x[target]).toBe(isin(0) * 40);
    expect(s.y[target]).toBe(icos(0) * 10 - 22000);
    expect(s.z[target]).toBe(isin(0) * 40);
    expect(s.f).toBe(1);
  });

  it('eases dropper by 100/tick down to a 4000 floor', () => {
    const s = createBallsState();
    stepBalls(s);
    expect(s.dropper).toBe(21900);
    for (let k = 0; k < 1000; k++) stepBalls(s);
    expect(s.dropper).toBe(4000);
  });

  it('drives the camera by rot=isin(rots) before frame 1900 (rots grows by 2/tick)', () => {
    const s = createBallsState();
    stepBalls(s); // rots: 0→2; rot = isin(2)
    expect(s.rots).toBe(2);
    expect(s.rot).toBe(isin(2));
    // rotsin/rotcos captured the rot BEFORE this tick's update (rot was 0): icos(0)*64 / isin(0)*64.
    expect(s.rotcos).toBe(icos(0) * 64);
    expect(s.rotsin).toBe(isin(0) * 64);
  });

  it('switches to momentum spin after frame 1900 (rot += rota/64; rota--)', () => {
    const s = createBallsState();
    s.frame = 1901;
    s.rot = 100;
    s.rota = -64;
    stepBalls(s); // frame→1902 (>1900): rot += idiv(-64,64) = -1 → 99; rota → -65
    expect(s.rot).toBe(99);
    expect(s.rota).toBe(-65);
  });
});

describe('projectBall — the ASM.ASM _drawdots fixed-point projection + gravity', () => {
  // Hand-built state: rot=0 → rotcos=icos(0)*64=16384, rotsin=isin(0)*64=0.
  const make = (X: number, Y: number, Z: number, yadd: number): BallsState => {
    const s = createBallsState();
    s.rotcos = icos(0) * 64;
    s.rotsin = isin(0) * 64;
    s.x[0] = X;
    s.y[0] = Y;
    s.z[0] = Z;
    s.yadd[0] = yadd;
    return s;
  };

  it('computes bp, screenX, shadowRow, ballRow, depthIdx against the fixed-point oracle', () => {
    // A swirl-phase ball (f=3): X=2040, Y=-19520, Z=3120.
    const X = isin(3 * 11) * 40;
    const Y = icos(3 * 13) * 10 - 22000;
    const Z = isin(3 * 17) * 40;
    const s = make(X, Y, Z, 0);
    const r = projectBall(s, 0);
    const bp = asr(Z * 16384, 16) - asr(X * 0, 16) + 9000;
    expect(r.bp).toBe(bp);
    const p = asr(X * 16384 + Z * 0, 8);
    expect(r.screenX).toBe(idiv(p + asr(p, 3), bp) + 160);
    expect(r.shadowRow).toBe(idiv(0x00080000, bp) + 100);
    expect(r.depthIdx).toBe(depthElement(bp));
    // Y is high above the floor → ball clipped off the top (negative row), still visible shadow.
    expect(r.visible).toBe(true);
    expect(r.ballVisible).toBe(false);
  });

  it('integrates gravity and writes back y/yadd only when the ball passes the on-screen gate', () => {
    // Place the ball near the floor and on-screen so the gravity branch runs.
    const s = make(0, 8000, 0, 10);
    const beforeY = s.y[0] ?? 0;
    projectBall(s, 0);
    // yadd += grav(3) = 13; y = 8000+13 = 8013 ≥ 8105? no → no bounce.
    expect(s.yadd[0]).toBe(13);
    expect(s.y[0]).toBe(beforeY + 13);
  });

  it('bounces off the floor: yadd = (−yadd·gravityd) asr 4 when y ≥ gravitybottom', () => {
    const s = make(0, 8100, 0, 10);
    projectBall(s, 0);
    // yadd0 = 10+3 = 13; y = 8100+13 = 8113 ≥ 8105 → bounce.
    // yadd_new = asr(-13*13, 4) = asr(-169,4) = -11; y = 8100 + 13 + (-11) = 8102.
    expect(s.yadd[0]).toBe(asr(-13 * s.gravd, 4));
    expect(s.y[0]).toBe(8102);
    expect(GRAVITY_BOTTOM).toBe(8105);
  });

  it('rejects off-screen balls (unsigned sx>319) without integrating gravity', () => {
    // Large X drives screenX far right; the unsigned gate skips everything incl. gravity writeback.
    const s = make(1_000_000, 8000, 0, 10);
    const yaddBefore = s.yadd[0] ?? 0;
    const r = projectBall(s, 0);
    expect(r.visible).toBe(false);
    expect(s.yadd[0]).toBe(yaddBefore); // gravity NOT applied (asm jumps to @@2 before the ball code)
  });
});
