import { MONSTER_H, MONSTER_W } from './picture.js';

/**
 * The PANIC "fake crash" animation, ported from `SHUTDOWN.C`'s `shutdown()`. The original is a
 * sequence of per-frame (`dis_waitb()`) steps that pretend the machine crashes: the MONSTER picture
 * collapses vertically toward the screen centre while flashing white, a horizontal line wipes in from
 * both edges, and a single dot pulses at the centre — the classic CRT-shrinking-to-a-dot gag.
 *
 * The original drives a stretched 640×400 planar field (centre row 200) by VGA latch-copy block moves
 * and palette swaps; here we model the *visible motion* directly in the picture's native 320×200 logical
 * field (centre row 100). The palette fade is reproduced from `fadepals` by lerping the LUT toward white
 * (see `fadeVgaPalette`), driven by `fadeA`.
 *
 * Phases and their frame counts (one frame = one `dis_waitb`):
 *   wash      2   — the two pre-collapse palette washes (fadepals[3], fadepals[20]).
 *   collapse  11  — `for(a=32;a>2;a=a*5/6)`: squash the picture into a band ±a (400-space) / ±a/2
 *                   (200-space) around the centre, palette fadepals[63-a] brightening toward white.
 *   wipe      47  — `for(x=20;x<=160;x+=3)`: black out the centre row from both edges inward.
 *   dot       60  — `for(a=0;a<60;a++)`: pulse the centre dot grey, cos(a/120·3·2π)·31+32 (~1.5 periods).
 *   done          — final hold (`sleep(1)`); the dot stays at its last brightness.
 */

/** SHUTDOWN.C `for(a=32;a>2;a=a*5/6)` — C integer division (trunc). */
function buildCollapseA(): number[] {
  const seq: number[] = [];
  for (let a = 32; a > 2; a = Math.trunc((a * 5) / 6)) seq.push(a);
  return seq;
}
export const COLLAPSE_A: readonly number[] = buildCollapseA();

export const WASH_FRAMES = 2;
export const COLLAPSE_FRAMES = COLLAPSE_A.length; // 11

/** SHUTDOWN.C `for(x=20;x<=160;x+=3)`. */
export const WIPE_START = 20;
export const WIPE_END = 160;
export const WIPE_STEP = 3;
export const WIPE_FRAMES = Math.floor((WIPE_END - WIPE_START) / WIPE_STEP) + 1; // 47

/** SHUTDOWN.C `for(a=0;a<60;a++)` cos-pulse. */
export const DOT_FRAMES = 60;

export const TOTAL_FRAMES = WASH_FRAMES + COLLAPSE_FRAMES + WIPE_FRAMES + DOT_FRAMES; // 120

export type CrashPhase = 'wash' | 'collapse' | 'wipe' | 'dot' | 'done';

export interface CrashState {
  /** Active phase. */
  phase: CrashPhase;
  /** Absolute frame counter since the crash began. */
  frame: number;
  /** fadepals index 0..63 (0 = picture palette, 63 = white). Drives the LUT fade in nodes.ts. */
  fadeA: number;
  /** Collapse band half-height in 200-space rows; the picture is squashed into [100±bandHalf]. */
  bandHalf: number;
  /** Wipe extent: centre-row columns [0,wipeX) and (W-wipeX,W) are blacked out. */
  wipeX: number;
  /** Whether the centre dot is shown (dot/done phases). */
  dotVisible: boolean;
  /** Centre-dot grey level 0..63 (DAC), applied to palette index 1. */
  dotBright: number;
}

export function createCrashState(): CrashState {
  const s: CrashState = {
    phase: 'wash',
    frame: 0,
    fadeA: 0,
    bandHalf: MONSTER_H / 2,
    wipeX: WIPE_START,
    dotVisible: false,
    dotBright: 0,
  };
  deriveCrash(s, 0); // frame-0 displayed state
  return s;
}

const CENTER_ROW = MONSTER_H / 2; // 100
const CENTER_COL = MONSTER_W / 2; // 160

/** SHUTDOWN.C dot pulse: cos(a/120·3·2π)·31+32, truncated to an int DAC level. */
function dotBrightness(a: number): number {
  return Math.trunc(Math.cos((a / 120) * 3 * 2 * Math.PI) * 31 + 32);
}

/** Compute every derived field for the frame `f` displayed (clamped to the final hold). */
function deriveCrash(s: CrashState, f: number): void {
  const frame = f >= TOTAL_FRAMES ? TOTAL_FRAMES : f;

  if (frame < WASH_FRAMES) {
    // Two washes: fadepals[3] then fadepals[20] (SHUTDOWN.C before the collapse loop).
    s.phase = 'wash';
    s.fadeA = frame === 0 ? 3 : 20;
    s.bandHalf = MONSTER_H / 2;
    s.wipeX = WIPE_START;
    s.dotVisible = false;
  } else if (frame < WASH_FRAMES + COLLAPSE_FRAMES) {
    s.phase = 'collapse';
    const a = COLLAPSE_A[frame - WASH_FRAMES] ?? 3;
    s.fadeA = 63 - a;
    s.bandHalf = Math.trunc(a / 2); // ±a in 400-space → ±a/2 in 200-space
    s.wipeX = WIPE_START;
    s.dotVisible = false;
  } else if (frame < WASH_FRAMES + COLLAPSE_FRAMES + WIPE_FRAMES) {
    s.phase = 'wipe';
    s.fadeA = 60; // stays at the brightest collapse palette through the wipe
    s.bandHalf = 0; // collapsed to the centre line
    const k = frame - (WASH_FRAMES + COLLAPSE_FRAMES);
    s.wipeX = WIPE_START + k * WIPE_STEP;
    s.dotVisible = false;
  } else {
    // dot phase (and the final hold, which keeps the last dot brightness).
    const a = frame - (WASH_FRAMES + COLLAPSE_FRAMES + WIPE_FRAMES);
    s.phase = frame >= TOTAL_FRAMES ? 'done' : 'dot';
    s.fadeA = 60;
    s.bandHalf = 0;
    s.wipeX = WIPE_END; // fully wiped
    s.dotVisible = true;
    s.dotBright = dotBrightness(a >= DOT_FRAMES ? DOT_FRAMES - 1 : a);
  }
}

/** Advance one frame (one `dis_waitb`) and recompute the displayed state. Clamps at the final hold. */
export function stepCrash(s: CrashState): void {
  if (s.frame >= TOTAL_FRAMES) {
    s.frame = TOTAL_FRAMES;
    deriveCrash(s, TOTAL_FRAMES);
    return;
  }
  s.frame += 1;
  deriveCrash(s, s.frame);
}

/**
 * Write the 320×200 palette-index buffer for the current crash state.
 *  - wash: the full picture (palette wash is a LUT effect, not an index change).
 *  - collapse: the whole picture squashed into the band [100−bandHalf, 100+bandHalf]; outside = black.
 *  - wipe: the centre line (the collapsed band at row 100) with its edges blacked out by `wipeX`.
 *  - dot/done: a single lit pixel at the centre (palette index 1, the white slot the dot pulses).
 */
export function rasterCrash(out: Uint8Array, s: CrashState, picture: Uint8Array): void {
  out.fill(0);

  if (s.phase === 'wash') {
    out.set(picture.subarray(0, MONSTER_W * MONSTER_H));
    return;
  }

  if (s.phase === 'collapse') {
    const top = CENTER_ROW - s.bandHalf;
    const bottom = CENTER_ROW + s.bandHalf;
    const span = bottom - top; // 2*bandHalf
    for (let dy = top; dy <= bottom; dy++) {
      if (dy < 0 || dy >= MONSTER_H) continue;
      // Map the band linearly onto the full picture height (squash the picture into the band).
      const sy = span > 0 ? Math.trunc(((dy - top) * (MONSTER_H - 1)) / span) : CENTER_ROW;
      const srcRow = sy * MONSTER_W;
      const dstRow = dy * MONSTER_W;
      for (let x = 0; x < MONSTER_W; x++) out[dstRow + x] = picture[srcRow + x] ?? 0;
    }
    return;
  }

  // wipe / dot / done: the collapsed picture is now a single centre line.
  if (s.phase === 'wipe') {
    const dstRow = CENTER_ROW * MONSTER_W;
    // Sample the picture's middle row as the residual scan line.
    const srcRow = CENTER_ROW * MONSTER_W;
    for (let x = 0; x < MONSTER_W; x++) out[dstRow + x] = picture[srcRow + x] ?? 0;
    // Black out from both edges inward.
    for (let x = 0; x < s.wipeX && x < MONSTER_W; x++) {
      out[dstRow + x] = 0;
      out[dstRow + (MONSTER_W - 1 - x)] = 0;
    }
    return;
  }

  // dot / done: a single centre pixel lit (the pulsing dot — palette index 1).
  out[CENTER_ROW * MONSTER_W + CENTER_COL] = 1;
}
