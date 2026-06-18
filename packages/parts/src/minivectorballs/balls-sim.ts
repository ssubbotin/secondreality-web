import { icos, isin } from './sin1024.js';
import { asr, depthElement, idiv } from './tables.js';

/**
 * The DOTS simulation, ported from MAIN.C (the dot-animation phase machine + camera spin) and ASM.ASM
 * `_drawdots` (the 3D rotate→project→perspective-divide + gravity integration). Pure over `BallsState`.
 *
 * One sim tick = one `while(repeat--)` body in MAIN.C: it repositions exactly one ball (round-robin
 * through the scrambled order), eases `dropper`, and advances the camera spin. Gravity is integrated and
 * the balls projected once per drawn frame by `projectFrame` (the `_drawdots` body); to stay
 * display-fps-independent the Effect runs both on a fixed-timestep accumulator, so each tick performs one
 * `_drawdots`-equivalent gravity step — documented as a deliberate deviation (the original integrated
 * gravity once per displayed frame, usually ≈ one music tick).
 */

export const DOTNUM = 512;
export const DROPPER_START = 22000;
export const GRAVITY_BOTTOM = 8105; // MAIN.C overrides the asm default 8000
export const VEKE = 2450; // MAIN.C self-exit frame; the lab loops at this budget

/** Frame thresholds for the phase machine (MAIN.C inner loop). */
const PHASE_SWIRL_END = 500;
const PHASE_FOUNTAIN_END = 900;
const PHASE_RING_END = 1700;
const PHASE_SCATTER_END = 2360;

export interface BallsState {
  readonly x: Int32Array;
  readonly y: Int32Array;
  readonly z: Int32Array;
  readonly yadd: Int32Array;
  /** Scrambled round-robin order (`dottaul`); index `j` selects which ball to reposition this tick. */
  readonly order: Int32Array;
  frame: number;
  f: number;
  j: number;
  rot: number;
  rots: number;
  rota: number;
  dropper: number;
  grav: number;
  gravd: number;
  /** Camera rotation vectors (`icos(rot)*64`, `isin(rot)*64`) as of the latest tick — read by projection. */
  rotsin: number;
  rotcos: number;
  /** LCG state standing in for the C library `rand()` (the exact DOS stream is not reproducible). */
  rngState: number;
}

/** A 31-bit LCG (glibc `TYPE_0`) standing in for `rand()`; returns a value in [0, 0x7fff] like DOS rand. */
function rand(s: BallsState): number {
  s.rngState = (s.rngState * 1103515245 + 12345) & 0x7fffffff;
  return (s.rngState >> 16) & 0x7fff;
}

export function createBallsState(seed = 1): BallsState {
  const s: BallsState = {
    x: new Int32Array(DOTNUM),
    y: new Int32Array(DOTNUM),
    z: new Int32Array(DOTNUM),
    yadd: new Int32Array(DOTNUM),
    order: new Int32Array(DOTNUM),
    frame: 0,
    f: 0,
    j: 0,
    rot: 0,
    rots: 0,
    rota: -1 * 64, // MAIN.C: rota = -64
    dropper: DROPPER_START,
    grav: 3,
    gravd: 13,
    rotsin: 0,
    rotcos: 0,
    rngState: seed >>> 0,
  };
  for (let a = 0; a < DOTNUM; a++) s.order[a] = a;
  // MAIN.C scrambles the order table with 500 random swaps.
  for (let a = 0; a < 500; a++) {
    const b = rand(s) % DOTNUM;
    const c = rand(s) % DOTNUM;
    const d = s.order[b] ?? 0;
    s.order[b] = s.order[c] ?? 0;
    s.order[c] = d;
  }
  // All initial positions are identical ((0, 2560−dropper, 0)), so MAIN.C's 500-swap position scramble is
  // a no-op; we seed the start position directly.
  const y0 = 2560 - DROPPER_START;
  for (let a = 0; a < DOTNUM; a++) {
    s.y[a] = y0;
  }
  return s;
}

/** One MAIN.C `while(repeat--)` tick: reposition one ball, ease `dropper`, advance the camera spin. */
export function stepBalls(s: BallsState): void {
  s.frame++;
  if (s.frame === 500) s.f = 0;
  const i = s.order[s.j] ?? 0;
  s.j = (s.j + 1) % DOTNUM;
  const f = s.f;

  if (s.frame < PHASE_SWIRL_END) {
    s.x[i] = isin(f * 11) * 40;
    s.y[i] = icos(f * 13) * 10 - s.dropper;
    s.z[i] = isin(f * 17) * 40;
    s.yadd[i] = 0;
  } else if (s.frame < PHASE_FOUNTAIN_END) {
    s.x[i] = icos(f * 15) * 55;
    s.y[i] = s.dropper;
    s.z[i] = isin(f * 15) * 55;
    s.yadd[i] = -260;
  } else if (s.frame < PHASE_RING_END) {
    const a = idiv(isin(s.frame & 1023), 8); // MAIN.C: a = sin1024[frame & 1023] / 8
    s.x[i] = icos(f * 66) * a;
    s.y[i] = 8000;
    s.z[i] = isin(f * 66) * a;
    s.yadd[i] = -300;
  } else if (s.frame < PHASE_SCATTER_END) {
    s.x[i] = rand(s) - 16384;
    s.y[i] = 8000 - idiv(rand(s), 2);
    s.z[i] = rand(s) - 16384;
    s.yadd[i] = 0;
    if (s.frame > 1900 && (s.frame & 31) === 0 && s.grav > 0) s.grav--;
  }
  // (frame ≥ 2360 only ramps the palette in MAIN.C — handled by the renderer, not the dot positions.)

  if (s.dropper > 4000) s.dropper -= 100;
  s.rotcos = icos(s.rot) * 64;
  s.rotsin = isin(s.rot) * 64;
  s.rots += 2;
  if (s.frame > 1900) {
    s.rot += idiv(s.rota, 64);
    s.rota--;
  } else {
    s.rot = isin(s.rots);
  }
  s.f++;
}

/** The per-ball projection result (`_drawdots` outputs for one ball). */
export interface BallProjection {
  /** Whether the ball/shadow are drawn at all (passes the unsigned sx≤319 and shadow≤199 gates). */
  visible: boolean;
  screenX: number;
  shadowRow: number;
  /** Whether the ball sprite itself is on-screen (the extra by≤199 gate). */
  ballVisible: boolean;
  ballRow: number;
  /** Depth-table element `((bp>>6)&~3)/4` for the sprite brightness. */
  depthIdx: number;
  /** Perspective divisor (exposed for the modern renderer's depth sort). */
  bp: number;
}

/**
 * Project one ball (ASM.ASM `_drawdots` body) and integrate its gravity. Mutates the ball's `y`/`yadd`
 * in place (as the original writes back `dot[si+2]`/`dot[si+14]`) — but only when the ball passes the
 * sx/shadow on-screen gate, exactly as the asm reaches the gravity code only after the `@@2` skip.
 *
 * All arithmetic is fixed-point integer:
 *   bp = hi(Z·rotcos) − hi(X·rotsin) + 9000           (hi = arithmetic >>16, the imul high word)
 *   p  = (X·rotcos + Z·rotsin) asr 8
 *   sx = idiv(p + (p asr 3), bp) + 160                 (p·9/8 / bp, then centre)
 *   sh = idiv(0x00080000, bp) + 100                    (floor plane at world-y 524288)
 *   y  = Y + (yadd += gravity); if y ≥ bottom: yadd = (−yadd·gravityd) asr 4; y = Y + yadd_old + yadd_new
 *   by = idiv(y << 6, bp) + 100
 * Unsigned `>319`/`>199` clips reject negatives too (a negative wraps to a large unsigned word).
 */
export function projectBall(s: BallsState, i: number): BallProjection {
  const X = s.x[i] ?? 0;
  const Y = s.y[i] ?? 0;
  const Z = s.z[i] ?? 0;
  const bp = asr(Z * s.rotcos, 16) - asr(X * s.rotsin, 16) + 9000;

  const p = asr(X * s.rotcos + Z * s.rotsin, 8);
  const screenX = idiv(p + asr(p, 3), bp) + 160;
  if (screenX < 0 || screenX > 319) {
    return {
      visible: false,
      screenX,
      shadowRow: 0,
      ballVisible: false,
      ballRow: 0,
      depthIdx: 0,
      bp,
    };
  }

  const shadowRow = idiv(0x00080000, bp) + 100;
  if (shadowRow < 0 || shadowRow > 199) {
    return {
      visible: false,
      screenX,
      shadowRow,
      ballVisible: false,
      ballRow: 0,
      depthIdx: 0,
      bp,
    };
  }

  // Gravity integration + writeback (only reached when on-screen, matching the asm).
  let yadd = (s.yadd[i] ?? 0) + s.grav;
  let y = Y + yadd;
  if (y >= GRAVITY_BOTTOM) {
    const yaddOld = yadd;
    yadd = asr(-yadd * s.gravd, 4);
    y = Y + yaddOld + yadd;
  }
  s.yadd[i] = yadd;
  s.y[i] = y;

  const ballRow = idiv(y * 64, bp) + 100;
  const ballVisible = ballRow >= 0 && ballRow <= 199;
  const depthIdx = depthElement(bp);
  return { visible: true, screenX, shadowRow, ballVisible, ballRow, depthIdx, bp };
}
