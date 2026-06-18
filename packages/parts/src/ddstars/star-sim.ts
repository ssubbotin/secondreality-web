import { Lcg } from './tables.js';

/** STARS2 — total stars allocated (STARS.ASM `STARS2 equ 1024`). */
export const STARS_TOTAL = 1024;
/** STARS — the window the per-frame plot loop walks (STARS.ASM `STARS equ 512`; `bp` from STARS down). */
export const STARS_WINDOW = 512;
/** starlimit initial value (`mov cs:starlimit,STARS`). Counts down 1 per tick, widening the active set. */
export const STARLIMIT0 = 512;
/** init_stars runs staradd this many times as a warm-up (`mov cx,100` @@sa loop), pre-draining starlimit. */
export const WARMUP_TICKS = 100;
/** starpalfade caps at 32 (`cmp cs:starpalfade,32 / ja`), then the fade block is skipped (frozen). */
export const PALFADE_MAX = 32;

/** Centre offsets baked into the projection (`add dx,160` / `add dx,100`). */
const CENTER_X = 160;
const CENTER_Y = 100;
/** The live plot field is 100 rows tall (the y-clip `cmp dx,99 / ja`); rows 0..99 = the top screen half. */
export const FIELD_H = 100;
const SCREEN_W = 320;

/**
 * Depth → brightness-band palette index (STARS.ASM staradd lines 317-327). The byte z (after the −2 age)
 * selects which bit-plane(s) the dot lights, which map to palette indices via the mode-X plane masks:
 *   z ≥ 180        → plane A only → index 1 (far / dimmest, just entered)
 *   110 ≤ z < 180  → plane B only → index 2 (mid)
 *   z < 110        → planes A+B   → index 3 (near / brightest, about to recycle)
 */
export function bandForZ(z: number): number {
  if (z >= 180) return 1;
  if (z >= 110) return 2;
  return 3;
}

/**
 * The full star-field state. The 1024 stars are SoA typed arrays; the per-tick projection result is written
 * into the `sx`/`sy`/`band`/`starIndex` output arrays (length = STARS_WINDOW, the most that can plot in one
 * tick), with `count` the number of valid entries. `palfadeScale` is the 0→1 brightness multiplier the
 * renderers apply (the original ramped the DAC; we ramp a scale — see palette.ts).
 */
export interface StarState {
  /** Depth byte per star, 0..255 (used as an unsigned byte; aged −2/tick with wrap). */
  readonly z: Uint8Array;
  /** 3D x per star, signed −512..511. */
  readonly x: Int16Array;
  /** 3D y per star, signed −512..511. */
  readonly y: Int16Array;
  /** Projected screen x of each plotted star this tick (length STARS_WINDOW; first `count` valid). */
  readonly sx: Int16Array;
  /** Projected screen y (0..99) of each plotted star this tick. */
  readonly sy: Int16Array;
  /** Palette band (1/2/3) of each plotted star this tick. */
  readonly band: Uint8Array;
  /** Source star index of each plotted entry (for tests / debugging). */
  readonly starIndex: Int16Array;
  /** Number of valid plotted entries this tick. */
  count: number;
  /** Active-window gate, counts down from STARLIMIT0 (minus warm-up) to 0. */
  starlimit: number;
  /** Palette fade-in counter, 0→PALFADE_MAX. */
  palfade: number;
  /** Frame counter (drives the deferred text reveals / the self-loop cap). */
  frame: number;
  readonly rng: Lcg;
}

/** rand()&1023 − 512 ∈ [−512, 511], from the LCG high word (STARS.ASM `and ax,1023 / sub ax,512`). */
function randomCoord(rng: Lcg): number {
  return (rng.next() & 1023) - 512;
}

/**
 * init_stars (STARS.ASM lines 56-176). Seeds z descending (z = (cx−1) & 0xFF for cx = 1024..1, i.e.
 * star index k gets z = (1023 − k) & 0xFF) and random x,y, then runs WARMUP_TICKS staradd calls so
 * starlimit is already partly drained when the effect begins. We fold the warm-up into the initial
 * starlimit value (the warm-up plotting is discarded — only its starlimit side effect matters).
 */
export function createStarState(): StarState {
  const rng = new Lcg(0);
  const z = new Uint8Array(STARS_TOTAL);
  const x = new Int16Array(STARS_TOTAL);
  const y = new Int16Array(STARS_TOTAL);
  for (let k = 0; k < STARS_TOTAL; k++) {
    z[k] = (STARS_TOTAL - 1 - k) & 0xff;
    x[k] = randomCoord(rng);
    y[k] = randomCoord(rng);
  }
  return {
    z,
    x,
    y,
    sx: new Int16Array(STARS_WINDOW),
    sy: new Int16Array(STARS_WINDOW),
    band: new Uint8Array(STARS_WINDOW),
    starIndex: new Int16Array(STARS_WINDOW),
    count: 0,
    starlimit: STARLIMIT0 - WARMUP_TICKS,
    palfade: 0,
    frame: 0,
    rng,
  };
}

/**
 * One simulation tick = one `staradd` call (STARS.ASM lines 278-340) plus the per-frame counters.
 *
 * For each star k in the window [0, STARS_WINDOW):
 *   1. z := (z − 2) & 0xFF. If it borrowed past 0 (z was 0 or 1) → respawn fresh x,y (z keeps the wrap)
 *      and skip plotting this tick.
 *   2. The active-window gate: bp = STARS_WINDOW − k; if bp < starlimit the star is not yet active → skip.
 *   3. Project: screenY = ((y · muldivy[z]) >> 14) + 100, kept only if 0..99 (unsigned `ja` clip);
 *      screenX = ((x · muldivx[z]) >> 14) + 160, kept only if 0..319. The >> 14 is the original's
 *      `shld dx,ax,2` (top word of the 32-bit product << 2 = product/16384, two's-complement).
 *   4. Record (screenX, screenY, bandForZ(z)) into the output arrays.
 *
 * Then advance starlimit (−1, floored at 0), palfade (+1 up to PALFADE_MAX), and the frame counter.
 */
export function stepStars(s: StarState, muldivx: Int32Array, muldivy: Int32Array): void {
  let count = 0;
  const { z, x, y, sx, sy, band, starIndex } = s;
  for (let k = 0; k < STARS_WINDOW; k++) {
    const prev = z[k] ?? 0;
    const nz = (prev - 2) & 0xff;
    z[k] = nz;
    if (prev < 2) {
      // borrow: respawn (the original re-randomises x,y but leaves z at its wrapped value)
      x[k] = randomCoord(s.rng);
      y[k] = randomCoord(s.rng);
      continue;
    }
    const bp = STARS_WINDOW - k;
    if (bp < s.starlimit) continue; // not yet active

    const py = (((y[k] ?? 0) * (muldivy[nz] ?? 0)) >> 14) + CENTER_Y;
    if (py < 0 || py >= FIELD_H) continue;
    const px = (((x[k] ?? 0) * (muldivx[nz] ?? 0)) >> 14) + CENTER_X;
    if (px < 0 || px >= SCREEN_W) continue;

    sx[count] = px;
    sy[count] = py;
    band[count] = bandForZ(nz);
    starIndex[count] = k;
    count++;
  }
  s.count = count;

  if (s.starlimit > 0) s.starlimit--;
  if (s.palfade < PALFADE_MAX) s.palfade++;
  s.frame++;
}

/** The 0→1 fade-in multiplier the renderers apply to the palette (ramps over the first PALFADE_MAX ticks). */
export function palfadeScale(s: StarState): number {
  // The original ramps bl = clamp((palfade+1)<<3, 255); at palfade==PALFADE_MAX (32) → 264 → clamped 255.
  return Math.min(((s.palfade + 1) << 3) / 256, 1);
}
