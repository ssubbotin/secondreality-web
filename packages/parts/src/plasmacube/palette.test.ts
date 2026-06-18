import { describe, expect, it } from 'vitest';
import { buildCubePalette, shadeBand } from './palette.js';

describe('cube palette', () => {
  it('builds the three colour bands with the verbatim INITVECT ramps', () => {
    const p = buildCubePalette();
    const rgb = (i: number): [number, number, number] => [
      p[i * 3] ?? 0,
      p[i * 3 + 1] ?? 0,
      p[i * 3 + 2] ?? 0,
    ];
    // band 0 (blue → white)
    expect(rgb(1)).toEqual([0, 0, 2]);
    expect(rgb(31)).toEqual([0, 0, 62]);
    expect(rgb(32)).toEqual([0, 0, 63]);
    expect(rgb(63)).toEqual([62, 62, 63]);
    // band 1 (red → yellow) lives at entries 64..127
    expect(rgb(64)).toEqual([0, 0, 0]);
    expect(rgb(127)).toEqual([63, 62, 0]);
    // band 2 (orange → magenta/green) lives at entries 128..191
    expect(rgb(128)).toEqual([0, 0, 0]);
    expect(rgb(160)).toEqual([31, 0, 21]);
  });

  it('shadeBand scales one band by (in·shd) >> 6, leaving other bands untouched', () => {
    const p = buildCubePalette();
    const out = new Uint8Array(256 * 3);
    shadeBand(out, p, 0, 32); // half-bright band 0
    expect([out[3], out[4], out[5]]).toEqual([0, 0, 1]); // entry 1: blue 2 → (2·32)>>6 = 1
    shadeBand(out, p, 0, 63); // near-full band 0
    expect([out[96], out[97], out[98]]).toEqual([0, 0, 62]); // entry 32: blue 63 → (63·63)>>6 = 62
    // band 1 was never shaded into `out` → still zero.
    expect([out[192], out[193], out[194]]).toEqual([0, 0, 0]);
  });
});
