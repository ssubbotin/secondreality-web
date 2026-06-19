import { describe, expect, it } from 'vitest';
import { INITTABLE_K, INITTABLE_L } from '../plasma/phase.js';
import { buildLsini4, buildLsini16, buildPsini } from '../plasma/tables.js';
import { PlasmaBackground } from './plasma-bg.js';
import { SCREEN_H, SCREEN_W } from './raster.js';

const psini = buildPsini();
const lsini4 = buildLsini4();
const lsini16 = buildLsini16();

const PLASMA_COLS = 84;
const PLASMA_LINES = 280;
const PLASMA_W = 320;
const PLASMA_H = 280;

const round = (i: number): number => Math.floor(i + 0.5);
const pmod = (a: number, n: number): number => ((a % n) + n) % n;

/** Reference field index for one param set, mirroring plasma/nodes.ts fieldIdx exactly. */
function refFieldIdx(ccc: number, yy: number, q: readonly number[]): number {
  const l16 = lsini16[round(pmod(yy - 4 * ccc + (q[1] ?? 0) + 320, 8192))] ?? 0;
  const l4 = lsini4[round(pmod(yy + 16 * ccc + (q[3] ?? 0), 8192))] ?? 0;
  const a1 = pmod(round(8 * ccc + l16 + (q[0] ?? 0)), 16384);
  const a2 = pmod(round(2 * yy - 4 * ccc + l4 + (q[2] ?? 0) + 320), 16384);
  return ((psini[a1] ?? 0) + (psini[a2] ?? 0)) % 256;
}

describe('plasma background (CPU port of the GPU plasma field)', () => {
  it('paints a full 320×200 frame with every index in 0..255', () => {
    const bg = new PlasmaBackground();
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    bg.paint(out);
    expect(out).toHaveLength(SCREEN_W * SCREEN_H);
    let nonzero = 0;
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
      if (v !== 0) nonzero++;
    }
    expect(nonzero).toBeGreaterThan(1000); // the field is not blank
  });

  it('matches the shipped GPU fieldIdx formula at the section-0 init phase', () => {
    const bg = new PlasmaBackground();
    const k = INITTABLE_K[0] ?? [3500, 2300, 3900, 3670];
    const l = INITTABLE_L[0] ?? [1000, 2000, 3000, 4000];
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    bg.paint(out);

    for (const [px, py] of [
      [0, 0],
      [1, 0],
      [10, 7],
      [160, 100],
      [319, 199],
      [200, 50],
    ] as const) {
      const u = (px + 0.5) / SCREEN_W;
      const v = (py + 0.5) / SCREEN_H;
      const ccc = u * PLASMA_COLS;
      const yy = v * PLASMA_LINES;
      const parity = (Math.floor(u * PLASMA_W) + Math.floor(v * PLASMA_H)) & 1;
      const expected = refFieldIdx(ccc, yy, parity === 1 ? k : l);
      expect(out[py * SCREEN_W + px]).toBe(expected);
    }
  });

  it('step() advances the phase so the field changes (the copper moveplz animation)', () => {
    const bg = new PlasmaBackground();
    const before = new Uint8Array(SCREEN_W * SCREEN_H);
    bg.paint(before);
    for (let i = 0; i < 10; i++) bg.step();
    const after = new Uint8Array(SCREEN_W * SCREEN_H);
    bg.paint(after);
    let diff = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });

  it('reset() restores the section-0 init phase (re-entry / loop is deterministic)', () => {
    const a = new PlasmaBackground();
    const first = new Uint8Array(SCREEN_W * SCREEN_H);
    a.paint(first);
    for (let i = 0; i < 25; i++) a.step();
    a.reset();
    const reset = new Uint8Array(SCREEN_W * SCREEN_H);
    a.paint(reset);
    expect(Array.from(reset)).toEqual(Array.from(first));
    expect(a.phaseK()).toEqual(INITTABLE_K[0]);
    expect(a.phaseL()).toEqual(INITTABLE_L[0]);
  });

  it('the section-0 palette is the plasma RGB palette (entry 0 is black)', () => {
    const bg = new PlasmaBackground();
    const pal = bg.palette();
    expect(pal).toHaveLength(256 * 3);
    expect(pal[0]).toBe(0);
    expect(pal[1]).toBe(0);
    expect(pal[2]).toBe(0);
  });
});
