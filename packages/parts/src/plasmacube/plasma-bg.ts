// packages/parts/src/plasmacube/plasma-bg.ts
//
// CPU port of the PLZPART plasma copper background (MAIN.C: plz() runs the fullscreen summed-sine
// plasma into VGA memory, then vect() draws the cube on top of it — do_clear/do_block only touch the
// cube's polygon footprint, so the plasma persists as the background, PLZA.ASM do_clear). This is the
// authentic-mode CPU equivalent of the already-shipped GPU plasma field (packages/parts/src/plasma):
// it reproduces that field's per-pixel index exactly so the chunky 320×200 composite matches the
// modern GPU-cube-over-plasma composite. The plasma field/palette MATH is owned by the plasma module
// and imported READ-ONLY — this file only rasterises it on the CPU and never re-derives it.
import { buildPlasmaPalettes } from '../plasma/palette.js';
import { INITTABLE_K, INITTABLE_L, moveplz, moveplzL, type PhaseK } from '../plasma/phase.js';
import { buildLsini4, buildLsini16, buildPsini, buildPtau } from '../plasma/tables.js';
import { SCREEN_H, SCREEN_W } from './raster.js';

/**
 * The logical plasma field size the GPU node samples (plasma/nodes.ts PLASMA_COLS = 84, PLASMA_LINES =
 * 280). The CPU rasteriser scales these over the 320×200 cube playfield so the field looks identical to
 * the GPU background regardless of which the cube composites onto.
 */
const PLASMA_COLS = 84;
const PLASMA_LINES = 280;
/** The interlace parity grid the GPU node uses (PLASMA_W × PLASMA_H), floor(u·W)+floor(v·H) & 1. */
const PLASMA_W = 320;
const PLASMA_H = 280;

const TABLE_PSINI = 16384;
const TABLE_LSINI = 8192;

/** Round-to-nearest table index, matching the GPU fetch (floor(i + 0.5)). */
function round(i: number): number {
  return Math.floor(i + 0.5);
}

/** Non-negative modulo (the GPU node adds a multiple of the table size before mod for the same reason). */
function pmod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * The CPU plasma background. Owns the verbatim plasma sine tables + palettes (imported from the plasma
 * module) and advances the same `moveplz`/`moveplzL` phase the GPU field uses, then rasterises the
 * summed-sine field into a 320×200 8-bit index buffer mapped through the active plasma palette.
 *
 * Per pixel (ASMYT.ASM plzline / plasma/nodes.ts fieldIdx, the shipped self-modifying addressing):
 *   l16 = lsini16[(yy − 4·ccc + q2 + 320) mod 8192]   (lsini16 pre-scaled ×16)
 *   l4  = lsini4 [(yy + 16·ccc + q4)       mod 8192]   (lsini4  pre-scaled ×8)
 *   a1  = (8·ccc + l16 + q1)               mod 16384
 *   a2  = (2·yy − 4·ccc + l4 + q3 + 320)   mod 16384
 *   idx = (psini[a1] + psini[a2])          mod 256
 * with q = the k param set on odd parity cells, the l set on even (the scanline interlace).
 */
export class PlasmaBackground {
  private readonly psini = buildPsini();
  private readonly lsini4 = buildLsini4();
  private readonly lsini16 = buildLsini16();
  private readonly palettes = buildPlasmaPalettes(buildPtau());

  private k: PhaseK = INITTABLE_K[0] ?? [3500, 2300, 3900, 3670];
  private l: PhaseK = INITTABLE_L[0] ?? [1000, 2000, 3000, 4000];

  /** Reset the phase params to the section-0 init values (re-entry / loop restart). */
  reset(): void {
    this.k = INITTABLE_K[0] ?? [3500, 2300, 3900, 3670];
    this.l = INITTABLE_L[0] ?? [1000, 2000, 3000, 4000];
  }

  /** Advance the k/l phase params one VGA frame (COPPER.ASM moveplz). */
  step(): void {
    this.k = moveplz(this.k);
    this.l = moveplzL(this.l);
  }

  /** The active 256×RGB plasma palette (values 0..63). Section 0 is the RGB palette (PLZ.C pals[0]). */
  palette(): Uint8Array {
    return this.palettes[0] ?? new Uint8Array(256 * 3);
  }

  /** The current k parameter set (the GPU field uses the same set for the odd-parity interlace cells). */
  phaseK(): PhaseK {
    return this.k;
  }

  /** The current l parameter set (the even-parity interlace cells). */
  phaseL(): PhaseK {
    return this.l;
  }

  /** The 8-bit field index for ONE parameter set at field coords (ccc, yy). */
  private fieldIdx(ccc: number, yy: number, q: PhaseK): number {
    const q1 = q[0];
    const q2 = q[1];
    const q3 = q[2];
    const q4 = q[3];
    const l16 = this.lsini16[round(pmod(yy - 4 * ccc + q2 + 320, TABLE_LSINI))] ?? 0;
    const l4 = this.lsini4[round(pmod(yy + 16 * ccc + q4, TABLE_LSINI))] ?? 0;
    const a1 = pmod(round(8 * ccc + l16 + q1), TABLE_PSINI);
    const a2 = pmod(round(2 * yy - 4 * ccc + l4 + q3 + 320), TABLE_PSINI);
    return ((this.psini[a1] ?? 0) + (this.psini[a2] ?? 0)) % 256;
  }

  /**
   * Rasterise the current plasma frame into `out` (SCREEN_W × SCREEN_H, row 0 = screen top). Each pixel
   * gets the summed-sine field index; the scanline interlace picks the k or l param set per cell
   * exactly as plasma/nodes.ts does (k on odd (x+y), l on even).
   */
  paint(out: Uint8Array): void {
    const k = this.k;
    const l = this.l;
    for (let py = 0; py < SCREEN_H; py++) {
      const v = (py + 0.5) / SCREEN_H;
      const yy = v * PLASMA_LINES;
      const parityRow = Math.floor(v * PLASMA_H);
      const rowBase = py * SCREEN_W;
      for (let px = 0; px < SCREEN_W; px++) {
        const u = (px + 0.5) / SCREEN_W;
        const ccc = u * PLASMA_COLS;
        const parity = (Math.floor(u * PLASMA_W) + parityRow) & 1;
        out[rowBase + px] = this.fieldIdx(ccc, yy, parity === 1 ? k : l);
      }
    }
  }
}
