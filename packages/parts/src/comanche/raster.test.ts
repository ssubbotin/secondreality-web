import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createFieldState, stepField } from './field-sim.js';
import { buildHeightOffset, FIELD_H, FIELD_W, rasterColumn, rasterField } from './raster.js';
import { buildSin1024, buildZwave, parseWaveField } from './tables.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

const heightX = parseWaveField(toArrayBuffer(fixture('W1DTA.BIN')));
const heightY = parseWaveField(toArrayBuffer(fixture('W2DTA.BIN')));
const off = buildHeightOffset(buildZwave());
const sin1024 = buildSin1024();

interface OracleCase {
  in: [number, number, number, number];
  col: number[];
}
const oracle: OracleCase[] = JSON.parse(fixture('raster-columns.json').toString('utf8'));

// rasterColumn writes column 0 of a FIELD_W-stride buffer; pull it back into a flat 200-array.
function runColumn(si: number, di: number, xs1: number, ys1: number): number[] {
  const out = new Uint8Array(FIELD_W * FIELD_H);
  rasterColumn(out, si & 0xfffe, di & 0xfffe, xs1 & 0xfffe, ys1 & 0xfffe, heightX, heightY, off);
  const col: number[] = [];
  for (let row = 0; row < FIELD_H; row++) col.push(out[row * FIELD_W] ?? 0);
  return col;
}

describe('comanche raster (THELOOP voxel walk)', () => {
  it('rasterColumn reproduces the THELOOP.INC register emulation byte-for-byte (oracle columns)', () => {
    for (const c of oracle) {
      const [si, di, xs1, ys1] = c.in;
      expect(runColumn(si, di, xs1, ys1)).toEqual(c.col);
    }
  });

  it('the field is smooth rolling hills — no spurious tall single-column spikes', () => {
    // Regression for the carry-drop spike bug: THELOOP.INC's `_@seek2a` (2-row hit) and the sina2
    // `_@seeko` exit are add-WITH-carry (`adc`); a plain `add` that dropped the carry-out left a column's
    // ray slope one fixed-point unit too shallow so the ray never cleared the terrain and the column
    // over-filled dozens of rows, sticking a tall 1px-wide spike above the smooth hills. The original
    // cannot do this: adjacent columns sample neighbouring heightfield cells, so the terrain top (first
    // lit row) varies only gently across the screen.
    const out = new Uint8Array(FIELD_W * FIELD_H);
    const s = createFieldState();
    for (let i = 0; i < 60; i++) stepField(s, sin1024);
    rasterField(out, s, heightX, heightY, off);
    const tops: number[] = [];
    for (let x = 0; x < FIELD_W; x++) {
      let top = FIELD_H;
      for (let y = 0; y < FIELD_H; y++) {
        if ((out[y * FIELD_W + x] ?? 0) !== 0) {
          top = y;
          break;
        }
      }
      tops.push(top);
    }
    // No column's terrain top juts more than a few rows above either neighbour (a spike would jut tens).
    let maxJut = 0;
    for (let x = 1; x < FIELD_W - 1; x++) {
      const cur = tops[x] ?? FIELD_H;
      const lo = Math.min(tops[x - 1] ?? FIELD_H, tops[x + 1] ?? FIELD_H);
      maxJut = Math.max(maxJut, lo - cur);
    }
    expect(maxJut).toBeLessThanOrEqual(8);
  });

  it('a flat field is sky (0) up top and solid terrain at the bottom', () => {
    const col = runColumn(0, 0, 0, 74);
    expect(col.slice(0, 60).every((v) => v === 0)).toBe(true); // sky
    expect(col.slice(120).every((v) => v > 0)).toBe(true); // terrain near the camera
  });

  it('rasterField fills a 160×200 buffer; clears to sky then draws terrain at the bottom', () => {
    const out = new Uint8Array(FIELD_W * FIELD_H);
    out.fill(99); // poison: prove the clear ran
    const s = createFieldState();
    for (let i = 0; i < 60; i++) stepField(s, sin1024); // advance into the field for terrain variation
    rasterField(out, s, heightX, heightY, off);
    // bottom row mostly lit
    let litBottom = 0;
    for (let x = 0; x < FIELD_W; x++) if ((out[199 * FIELD_W + x] ?? 0) > 0) litBottom++;
    expect(litBottom).toBeGreaterThan(FIELD_W / 2);
    // top row mostly sky
    let litTop = 0;
    for (let x = 0; x < FIELD_W; x++) if ((out[0 * FIELD_W + x] ?? 0) > 0) litTop++;
    expect(litTop).toBeLessThan(FIELD_W / 2);
  });

  it('rasterField writes only valid palette bytes and never out of bounds', () => {
    const out = new Uint8Array(FIELD_W * FIELD_H);
    const s = createFieldState();
    for (let i = 0; i < 200; i++) stepField(s, sin1024);
    expect(() => rasterField(out, s, heightX, heightY, off)).not.toThrow();
    expect(out).toHaveLength(FIELD_W * FIELD_H);
    for (const v of out) expect(v).toBeLessThanOrEqual(255);
  });

  it('the COMBG backdrop fills the sky and the terrain composites on top of it', () => {
    // _docopy blits the COMBG sky first, then the terrain over it. A backdrop passed to rasterField must
    // survive in the upper rows the ray never hits, while the lower terrain rows overwrite it.
    const backdrop = new Uint8Array(FIELD_W * 90);
    // A recognisable non-zero sky band over rows 60..89 (mirrors COMBG's 225..255 horizon ramp).
    for (let y = 60; y < 90; y++) for (let x = 0; x < FIELD_W; x++) backdrop[y * FIELD_W + x] = 250;
    const out = new Uint8Array(FIELD_W * FIELD_H);
    out.fill(99); // poison
    const s = createFieldState();
    for (let i = 0; i < 60; i++) stepField(s, sin1024);
    rasterField(out, s, heightX, heightY, off, backdrop);
    // Row 0 (above both backdrop band and terrain) is sky-black, not the poison.
    for (let x = 0; x < FIELD_W; x++) expect(out[x] ?? 0).toBe(0);
    // The bottom row is solid terrain (the ray always hits near the camera) — backdrop overwritten.
    let litBottom = 0;
    for (let x = 0; x < FIELD_W; x++) if ((out[199 * FIELD_W + x] ?? 0) > 0) litBottom++;
    expect(litBottom).toBeGreaterThan(FIELD_W / 2);
    // Somewhere in the backdrop band (rows 60..89) the sky value 250 survives where no terrain reaches.
    let survived = 0;
    for (let y = 60; y < 90; y++)
      for (let x = 0; x < FIELD_W; x++) if ((out[y * FIELD_W + x] ?? 0) === 250) survived++;
    expect(survived).toBeGreaterThan(0);
  });

  it('rasterField without a backdrop clears the sky to 0 (the math-only path is unchanged)', () => {
    const out = new Uint8Array(FIELD_W * FIELD_H);
    out.fill(99);
    const s = createFieldState();
    for (let i = 0; i < 60; i++) stepField(s, sin1024);
    rasterField(out, s, heightX, heightY, off);
    for (let x = 0; x < FIELD_W; x++) expect(out[x] ?? 0).toBe(0); // top row sky-black
  });

  it('columns are independent (different ray steps yield different silhouettes)', () => {
    const a = runColumn(0, 0, 0, 74);
    const b = runColumn(5000, 3000, -20, 40);
    expect(a).not.toEqual(b);
  });

  it('shades land in the palette gradient region, not the flat-cyan plateau (THELOOP `shr dl,1`)', () => {
    // The fidelity fix: `shr dl,1` shifts the LOW BYTE, so dl ∈ 0..127. With the byte mask applied AFTER
    // the shift (the old bug) the shades drift into ~185..211 — the flat cyan [0,63,63] plateau (≥152),
    // rendering the whole terrain one solid colour. Assert the drawn bytes stay below the plateau and
    // span a real range (a depth/height gradient, not a single value).
    const out = new Uint8Array(FIELD_W * FIELD_H);
    const s = createFieldState();
    for (let i = 0; i < 200; i++) stepField(s, sin1024);
    rasterField(out, s, heightX, heightY, off);
    const drawn = [...out].filter((v) => v > 0);
    expect(drawn.length).toBeGreaterThan(0);
    const lo = Math.min(...drawn);
    const hi = Math.max(...drawn);
    expect(hi).toBeLessThan(152); // below the [0,63,63] plateau
    expect(hi - lo).toBeGreaterThan(16); // a genuine gradient, not flat
  });
});
