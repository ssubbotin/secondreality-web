/**
 * COMBG sky backdrop — the picture drawn BEHIND the voxel terrain (COMAN/MAIN.C `main()` + `doit()`,
 * COMAN/ASM.ASM `_docopy`).
 *
 * The 1993 build authored the sky as `COMBG.LBM` (a Deluxe Paint `PBM ` chunky image, 320×90, 256 colours),
 * converted it with `lbm2u combg.lbm combg.uh` (GRAB/LBM2U.C) and linked the result as the `extern char
 * combg[]` symbol (`DOPIC.BAT`: `doobj combg.uh _combg`). The `.ux` layout `lbm2u` writes is:
 *
 *   word 0  0xfcfc   word 1  xsz(320)   word 2  ysz(90)   word 3  colors(256)
 *   word 4  para-add = (16 + colors*3 + 15)/16 = 49 → body starts at byte 49*16 = 784 = 768 + 16
 *   bytes 16..783   palette: `colors*3` bytes, each a 6-bit VGA component (`getc(f1)/4`)
 *   bytes 784..     body: `ysz` rows of `xsz` chunky 8-bit indices
 *
 * MAIN.C then reads that `combg[]`:
 *   - palette band:   `for(x=(256-16)*3;x<768;x++) palette[x]=combg[16+x];`  → palette indices 240..255 are
 *                     overwritten with the COMBG 6-bit palette (the dark-blue→light-blue horizon ramp).
 *   - backdrop body:  `combguse[x+y*160]=combg[x*4+y*320+768+16];` (plane 0/1) and
 *                     `combguse[x+80+y*160]=combg[x*4+2+y*320+768+16];` (plane 2/3), de-interleaving the
 *                     chunky body into mode-X planar order. `_docopy`'s PXLSUX block blits `combguse[bc]`
 *                     to planes 0+1 and `combguse[bc+80]` to planes 2+3, so screen columns pixel-double:
 *                     the effective 160-wide backdrop samples the EVEN chunky columns (field col a ↔ chunky
 *                     col 2a), one COMBG row per screen row (row y → screen row y).
 *
 * (The `combg.uh` checked into COMAN/ is a STALE artifact of an older converter — its palette band and body
 * are misaligned/zero — so the literal linked binary's sky degenerated to black. COMBG.LBM is the truth;
 * this module reproduces what `lbm2u`+MAIN.C intended from it.)
 *
 * `decodeLbm` already returns the chunky `indices` and the 6-bit `palette6` (`palette8 >> 2`, identical to
 * `lbm2u`'s `getc/4` truncation), so the two products are read straight off it.
 */

import { decodeLbm } from '@sr/engine';
import { FIELD_W } from './raster.js';

/** COMBG.LBM picture dimensions (BMHD: 320×90, chunky `PBM `). */
export const COMBG_W = 320;
export const COMBG_H = 90;

/** The decoded COMBG backdrop, ready to merge into the comanche palette + blit behind the terrain. */
export interface CombgBackdrop {
  /**
   * 48-byte (16 colours × RGB) 6-bit palette band for colour indices 240..255 — MAIN.C's
   * `palette[x]=combg[16+x]` for x = 720..767. Each component is 0..63.
   */
  readonly paletteBand: Uint8Array;
  /**
   * The backdrop body as FIELD_W (160) × COMBG_H (90) 8-bit palette indices, row 0 = screen top. Field
   * column `a` samples COMBG chunky column `2a` (the mode-X pixel-doubling the original `combguse` blit
   * performs); each COMBG row maps to one screen row.
   */
  readonly body: Uint8Array;
  /** Number of backdrop rows (= COMBG_H). Screen rows at/below this are sky-black (the terrain covers them). */
  readonly rows: number;
}

/**
 * Decode COMBG.LBM into the palette band (indices 240..255) and the 160×90 screen-order backdrop body.
 * Ports `lbm2u` (6-bit palette) + MAIN.C's palette/`combguse` loops + `_docopy`'s pixel-doubling blit.
 */
export function decodeCombg(buffer: ArrayBuffer | Uint8Array): CombgBackdrop {
  const pic = decodeLbm(buffer);

  // Palette band: MAIN.C `for(x=720;x<768;x++) palette[x]=combg[16+x]`. combg[16+x] is the 6-bit palette
  // byte `lbm2u` wrote at file offset 16+x, i.e. palette component (x) → colour index 240 + (x-720)/3.
  // decodeLbm's palette6 is `palette8>>2`, the same truncation as lbm2u's `getc/4`.
  const paletteBand = new Uint8Array(16 * 3);
  for (let i = 0; i < paletteBand.length; i++) {
    paletteBand[i] = pic.palette6[240 * 3 + i] ?? 0;
  }

  // Backdrop body: field col a ↔ chunky col 2a (the even columns the pixel-doubling blit keeps), one COMBG
  // row per screen row. Clamp to the picture's actual dimensions so a re-authored asset can't read OOB.
  const w = Math.min(FIELD_W, COMBG_W >> 1);
  const h = Math.min(COMBG_H, pic.height);
  const body = new Uint8Array(FIELD_W * COMBG_H);
  for (let y = 0; y < h; y++) {
    const srcRow = y * pic.width;
    const dstRow = y * FIELD_W;
    for (let a = 0; a < w; a++) {
      body[dstRow + a] = pic.indices[srcRow + a * 2] ?? 0;
    }
  }

  return { paletteBand, body, rows: COMBG_H };
}
