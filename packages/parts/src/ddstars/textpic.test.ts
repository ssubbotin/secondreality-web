import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeLbm } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { decodeTextpic, TEXTPIC_MAGIC, TEXTPIC_PLANES } from './textpic.js';

const texts16 = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./__fixtures__/TEXTS.16', import.meta.url))),
);
const textsLbm = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./__fixtures__/TEXTS.LBM', import.meta.url))),
);

describe('decodeTextpic', () => {
  it('parses the .16 header (magic / size / colors / 64-byte header)', () => {
    const tp = decodeTextpic(texts16);
    expect(texts16[0] | (texts16[1] << 8)).toBe(TEXTPIC_MAGIC);
    expect(tp.width).toBe(320);
    expect(tp.height).toBe(200);
    expect(tp.colors).toBe(16);
    // para-add = ceil((16 + 16*3)/16) = 4 → 64-byte header → `mov si,040h` in risetext.
    expect(tp.pixelOffset).toBe(0x40);
    expect(tp.indices.length).toBe(320 * 200);
  });

  it('decodes a 2-plane image: indices use only 0..3 (the green text bands)', () => {
    const tp = decodeTextpic(texts16, TEXTPIC_PLANES);
    const present = new Set(tp.indices);
    expect([...present].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('is byte-exact against the fixture re-decode (deterministic)', () => {
    const a = decodeTextpic(texts16);
    const b = decodeTextpic(texts16.slice());
    expect(b.indices).toEqual(a.indices);
    // A stable checksum pins the exact bytes so a regression in the deinterleave is caught.
    let sum = 0;
    let ink = 0;
    for (const v of a.indices) {
      sum += v;
      if (v) ink++;
    }
    expect(sum).toBe(25162);
    expect(ink).toBe(12462);
  });

  it('matches @sr/engine decodeLbm(TEXTS.LBM) & 3 (the .16 is the 2-plane reduction of the LBM)', () => {
    // TEXTS.16 was produced by `lbm16 texts.lbm texts.16 2`: it keeps the low 2 bits of every LBM index.
    // The LBM (256-colour PBM) only ever uses indices 0..3, so `lbm & 3 == texts16` exactly.
    const tp = decodeTextpic(texts16);
    const lbm = decodeLbm(textsLbm);
    expect(lbm.width).toBe(tp.width);
    expect(lbm.height).toBe(tp.height);
    let mism = 0;
    for (let i = 0; i < tp.indices.length; i++) {
      if (((lbm.indices[i] ?? 0) & 3) !== (tp.indices[i] ?? 0)) mism++;
    }
    expect(mism).toBe(0);
  });

  it('rejects a buffer with the wrong magic', () => {
    const bad = texts16.slice();
    bad[0] = 0;
    expect(() => decodeTextpic(bad)).toThrow(/magic/);
  });

  it('exposes the embedded 6-bit palette (green ramp; index 0 = black)', () => {
    const tp = decodeTextpic(texts16);
    // Palette stored 6-bit (the LBM16 loader divided by 4): black, then a green ramp.
    expect([tp.palette6[0], tp.palette6[1], tp.palette6[2]]).toEqual([0, 0, 0]);
    expect([tp.palette6[3], tp.palette6[4], tp.palette6[5]]).toEqual([0, 20, 0]);
    expect([tp.palette6[9], tp.palette6[10], tp.palette6[11]]).toEqual([0, 63, 0]);
  });
});
