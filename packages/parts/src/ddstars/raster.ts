import { FIELD_H, type StarState } from './star-sim.js';

export const SCREEN_W = 320;
export const SCREEN_H = 200;

/** The reflection lags the live field by 32 frames (STARS.ASM `emmpage4+32`). */
export const MIRROR_DELAY = 32;

/**
 * Plot the active stars of one tick into the top 100 rows of a 320×200 8-bit palette-index buffer
 * (STARS.ASM staradd plot + the `@@3`/`@@7` top-half composite). The sim already projected + clipped every
 * star to (sx∈[0,319], sy∈[0,99], band∈{1,2,3}); here we just write the band index. Clears the buffer first.
 *
 * This is the single-frame helper (no reflection); `StarRaster.render` layers the delayed mirror on top.
 */
export function rasterStars(out: Uint8Array, s: StarState): void {
  out.fill(0);
  for (let i = 0; i < s.count; i++) {
    const px = s.sx[i] ?? 0;
    const py = s.sy[i] ?? 0;
    out[py * SCREEN_W + px] = s.band[i] ?? 0;
  }
}

/**
 * The full DDSTARS frame: the live star field in the top half (rows 0..99) and a 32-frame-delayed,
 * vertically-mirrored copy in the bottom half (rows 100..199), reproducing STARS.ASM's `do_stars` composite
 * (`@@5`/`@@8` read the page `emmpage4+32` and copy it row-reversed into the bottom half — a reflection that
 * lags the real stars). The original's EMS page ring is reproduced here as a ring of the last MIRROR_DELAY+1
 * plotted frames (each a flat list of `(px, py, band)`); before the ring fills, the mirror reads cleared
 * frames, exactly as the original's `clearsbu`-cleared pages do.
 *
 * Mirror mapping: a delayed star at field row `r` (0..99) reflects to screen row `199 − r` (source row 99 →
 * dest row 100, source row 0 → dest row 199), the same row-reversal the original performs with `sub si,40`.
 */
export class StarRaster {
  // Ring of past frames; each frame is a packed [px,py,band, px,py,band, ...] Int16Array + a length.
  private readonly frames: Int16Array[] = [];
  private readonly lengths: number[] = [];
  private head = 0;
  private filled = 0;

  constructor() {
    for (let i = 0; i <= MIRROR_DELAY; i++) {
      this.frames.push(new Int16Array(0));
      this.lengths.push(0);
    }
  }

  render(out: Uint8Array, s: StarState): void {
    out.fill(0);

    // Top half: the current frame, and push it onto the ring.
    const cur = this.ensureFrame(this.head, s.count);
    for (let i = 0; i < s.count; i++) {
      const px = s.sx[i] ?? 0;
      const py = s.sy[i] ?? 0;
      const band = s.band[i] ?? 0;
      out[py * SCREEN_W + px] = band;
      cur[i * 3] = px;
      cur[i * 3 + 1] = py;
      cur[i * 3 + 2] = band;
    }
    this.lengths[this.head] = s.count;
    if (this.filled <= MIRROR_DELAY) this.filled++;

    // Bottom half: the frame MIRROR_DELAY ticks ago, vertically mirrored (row r → 199 − r).
    if (this.filled > MIRROR_DELAY) {
      const delayedIdx = (this.head - MIRROR_DELAY + this.frames.length) % this.frames.length;
      const frame = this.frames[delayedIdx];
      const len = this.lengths[delayedIdx] ?? 0;
      if (frame) {
        for (let i = 0; i < len; i++) {
          const py = frame[i * 3 + 1] ?? 0;
          if (py >= FIELD_H) continue;
          const px = frame[i * 3] ?? 0;
          const band = frame[i * 3 + 2] ?? 0;
          out[(SCREEN_H - 1 - py) * SCREEN_W + px] = band;
        }
      }
    }

    this.head = (this.head + 1) % this.frames.length;
  }

  /** Grow the ring slot to hold at least `count` stars, reusing the backing array when big enough. */
  private ensureFrame(idx: number, count: number): Int16Array {
    const need = count * 3;
    const existing = this.frames[idx];
    if (!existing || existing.length < need) {
      const grown = new Int16Array(need);
      this.frames[idx] = grown;
      return grown;
    }
    return existing;
  }

  /** Reset the reflection history (call on a self-loop). */
  reset(): void {
    this.head = 0;
    this.filled = 0;
    for (let i = 0; i < this.lengths.length; i++) this.lengths[i] = 0;
  }
}
