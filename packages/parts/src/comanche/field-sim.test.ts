import { describe, expect, it } from 'vitest';
import {
  CAMERA_LEVEL,
  COLS,
  COMAN_FRAMES,
  columnRay,
  createFieldState,
  type FieldState,
  stepField,
} from './field-sim.js';
import { buildSin1024 } from './tables.js';

const sin1024 = buildSin1024();

const stepN = (n: number): FieldState => {
  const s = createFieldState();
  for (let i = 0; i < n; i++) stepField(s, sin1024);
  return s;
};

describe('comanche field sim (doit camera walk)', () => {
  it('matches the doit() oracle for the first six ticks (rot/rot2 + ywav walk + startrise decay)', () => {
    // [tick, frame, rot, rot2, rsin, rcos, rsin2, rcos2, xwav, ywav, startrise] emulated from MAIN.C.
    const oracle: ReadonlyArray<readonly number[]> = [
      [1, 1, 0, 4, 0, 256, 226, 119, 0, 296, 159],
      [2, 2, 0, 8, 0, 256, 226, 119, 0, 592, 158],
      [3, 3, 1, 12, 0, 256, 226, 119, 0, 888, 157],
      [4, 4, 2, 16, 0, 256, 226, 119, 0, 1184, 156],
      [5, 5, 4, 20, 0, 256, 226, 119, 0, 1480, 155],
      [6, 6, 6, 24, 0, 256, 226, 119, 0, 1776, 154],
    ];
    const s = createFieldState();
    for (const row of oracle) {
      stepField(s, sin1024);
      const [, frame, rot, rot2, rsin, rcos, rsin2, rcos2, xwav, ywav, startrise] = row;
      expect(s.frame).toBe(frame);
      expect(s.rot).toBe(rot);
      expect(s.rot2).toBe(rot2);
      expect(s.rsin).toBe(rsin);
      expect(s.rcos).toBe(rcos);
      expect(s.rsin2).toBe(rsin2);
      expect(s.rcos2).toBe(rcos2);
      expect(s.xwav).toBe(xwav);
      expect(s.ywav).toBe(ywav);
      expect(s.startrise).toBe(startrise);
    }
  });

  it('columnRay reproduces (x·rcos+y·rsin)/256 and (y·rcos2−x·rsin2)/256 with C integer division', () => {
    const s = createFieldState();
    stepField(s, sin1024); // rsin=0, rcos=256, rsin2=226, rcos2=119
    // a=0 → x=−80, y=160
    const c0 = columnRay(0, s);
    expect(c0.xa).toBe(Math.trunc((-80 * s.rcos + 160 * s.rsin) / 256));
    expect(c0.ya).toBe(Math.trunc((160 * s.rcos2 - -80 * s.rsin2) / 256));
    // centre a=80 → x=0: xa = (160·rsin)/256, ya = (160·rcos2)/256
    const c80 = columnRay(80, s);
    expect(c80.xa).toBe(Math.trunc((160 * s.rsin) / 256));
    expect(c80.ya).toBe(Math.trunc((160 * s.rcos2) / 256));
    expect(c80.ya).toBe(74); // 160·119/256 = 74 (trunc)
  });

  it('the camera advance equals the centre ray (a==80) ×4 each tick', () => {
    const s = createFieldState();
    stepField(s, sin1024);
    const c80 = columnRay(80, s);
    // After the tick, ywav holds the accumulated centre-ray-×4 walk.
    expect(s.ywav).toBe(c80.ya * 4);
    expect(s.ywav).toBe(296); // 74·4
  });

  it('decays startrise to 0 within 400 ticks and holds it there', () => {
    const s = stepN(160); // startrise starts at 160, −1/tick while frame<400
    expect(s.startrise).toBe(0);
    const s2 = stepN(300);
    expect(s2.startrise).toBe(0);
  });

  it('clamps the frame counter at COMAN_FRAMES', () => {
    const s = createFieldState();
    s.frame = COMAN_FRAMES;
    stepField(s, sin1024);
    expect(s.frame).toBe(COMAN_FRAMES);
  });

  it('exposes the screen constants', () => {
    expect(COLS).toBe(160);
    expect(CAMERA_LEVEL).toBe(-270);
  });
});
