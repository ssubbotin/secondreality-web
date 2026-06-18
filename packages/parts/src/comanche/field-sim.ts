import { cdiv } from './tables.js';

/** Original COMAN doit() self-exit; the lab loops at this frame. */
export const COMAN_FRAMES = 4444;

/** The number of screen columns the camera walk casts (MAIN.C: a = 0..159). */
export const COLS = 160;

/** Camera height adder, constant in the shipped doit() (`cameralevel = −270`). */
export const CAMERA_LEVEL = -270;

/** Rotated ray step (the wave-X / wave-Y advance) for one screen column. */
export interface ColumnRay {
  /** wave-X step (`xa`), masked to even before the raster word-indexes it. */
  xa: number;
  /** wave-Y step (`ya`), masked to even. */
  ya: number;
}

/**
 * The COMAN doit() camera state. `xwav`/`ywav` is the wave-table position of the camera (it walks
 * forward each frame by the centre ray ×4); `rot`/`rot2` drive the wandering yaw; `startrise` is the
 * intro rise-from-below offset (160 → 0); `frame` is the displayed-frame counter (clamped at
 * COMAN_FRAMES). `rsin/rcos/rsin2/rcos2` are the current rotation's sine terms, recomputed each tick.
 */
export interface FieldState {
  rot: number;
  rot2: number;
  rsin: number;
  rcos: number;
  rsin2: number;
  rcos2: number;
  xwav: number;
  ywav: number;
  startrise: number;
  frame: number;
}

export function createFieldState(): FieldState {
  return {
    rot: 0,
    rot2: 0,
    rsin: 0,
    rcos: 256,
    rsin2: 0,
    rcos2: 256,
    xwav: 0,
    ywav: 0,
    startrise: 160,
    frame: 0,
  };
}

/**
 * The rotated ray step for screen column `a` (MAIN.C doit() inner loop):
 *   x  = a − 80;  y = 160
 *   xa = (x·rcos + y·rsin) / 256
 *   ya = (y·rcos2 − x·rsin2) / 256
 * All `/` are C integer division (trunc toward zero). Reads the current rotation from `s`.
 */
export function columnRay(a: number, s: FieldState): ColumnRay {
  const x = a - 80;
  const y = 160;
  const xa = cdiv(x * s.rcos + y * s.rsin, 256);
  const ya = cdiv(y * s.rcos2 - x * s.rsin2, 256);
  return { xa, ya };
}

/**
 * One simulation tick of doit() (MAIN.C):
 *   1. (intro) decay `startrise` toward 0 while frame < 400.
 *   2. advance the wandering yaw: rot2 += 4; rot += sin1024[rot2 & 1023] / 15; r = rot >> 3.
 *   3. recompute the four rotation sine terms (rsin/rcos at r, rsin2/rcos2 at r+177).
 *   4. advance the camera by the centre ray (column a==80) ×4: xwav += xa·4; ywav += ya·4.
 *   5. advance the frame counter (clamped at COMAN_FRAMES).
 * The original gated 1/2/4 on dis_musplus()/frame; we keep the rise behind the plain frame counter
 * (the music-tempo lock is the sequencer's job, as with the other parts).
 */
export function stepField(s: FieldState, sin1024: Int16Array): void {
  if (s.frame < 400 && s.startrise > 0) s.startrise -= 1;

  s.rot2 += 4;
  s.rot += cdiv(sin1024[s.rot2 & 1023] ?? 0, 15);
  const r = s.rot >> 3;
  s.rsin = sin1024[r & 1023] ?? 0;
  s.rcos = sin1024[(r + 256) & 1023] ?? 0;
  s.rsin2 = sin1024[(r + 177) & 1023] ?? 0;
  s.rcos2 = sin1024[(r + 177 + 256) & 1023] ?? 0;

  // Camera advance: doit() captures xw=xwav before the loop, then at a==80 advances xwav/ywav for the
  // NEXT frame by the centre ray ×4. The centre column's ray uses the rotation just computed.
  const centre = columnRay(80, s);
  s.xwav += centre.xa * 4;
  s.ywav += centre.ya * 4;

  if (s.frame < COMAN_FRAMES) s.frame++;
}
