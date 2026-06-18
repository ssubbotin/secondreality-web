import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { byteRun1Decode, decodeLbm, deinterleavePlanes, parseBmhd } from './lbm.js';

const hillback = (): Uint8Array =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL('./__fixtures__/HILLBACK.LBM', import.meta.url))),
  );

describe('byteRun1Decode (IFF ByteRun1 / PackBits)', () => {
  it('copies a literal run (control byte 0..127 → n+1 literals)', () => {
    // 0x02 → 3 literals
    const out = byteRun1Decode(new Uint8Array([0x02, 10, 20, 30]), 3);
    expect(Array.from(out)).toEqual([10, 20, 30]);
  });

  it('expands a repeat run (control byte 129..255 → 257-n repeats)', () => {
    // 0xFD = 253 → 257-253 = 4 repeats of 0x99
    const out = byteRun1Decode(new Uint8Array([0xfd, 0x99]), 4);
    expect(Array.from(out)).toEqual([0x99, 0x99, 0x99, 0x99]);
  });

  it('treats control byte 128 as a no-op', () => {
    const out = byteRun1Decode(new Uint8Array([0x80, 0x00, 0x99]), 1);
    // 0x80 skipped; 0x00 → 1 literal (0x99)
    expect(Array.from(out)).toEqual([0x99]);
  });

  it('stops at expectedLen and mixes literal + repeat runs', () => {
    // 0x01 → 2 literals (1,2); 0xFE → 2 repeats of 7
    const out = byteRun1Decode(new Uint8Array([0x01, 1, 2, 0xfe, 7]), 4);
    expect(Array.from(out)).toEqual([1, 2, 7, 7]);
  });
});

describe('deinterleavePlanes (ILBM planar → chunky)', () => {
  it('deinterleaves an 8×1 2-plane row into the right indices', () => {
    // plane0 = 0x55 (bit0 pattern 0,1,0,1,…), plane1 = 0x33 (bit1 pattern 0,0,1,1,…)
    const out = deinterleavePlanes(new Uint8Array([0x55, 0x33]), 8, 1, 2, false);
    expect(Array.from(out)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('deinterleaves a 16×1 3-plane row producing values 0..7', () => {
    const body = new Uint8Array([0x55, 0x55, 0x33, 0x33, 0x0f, 0x0f]);
    const out = deinterleavePlanes(body, 16, 1, 3, false);
    expect(Array.from(out)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('skips the mask plane bytes when masking is set', () => {
    // 2 colour planes + 1 mask plane (all-ones, must be ignored); 8×1.
    const body = new Uint8Array([0x55, 0x33, 0xff]);
    const out = deinterleavePlanes(body, 8, 1, 2, true);
    expect(Array.from(out)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('handles a width not a multiple of 8 (5 px, 1 plane)', () => {
    // plane0 = 0xA8 = 10101000 → first 5 pixels: 1,0,1,0,1
    const out = deinterleavePlanes(new Uint8Array([0xa8]), 5, 1, 1, false);
    expect(Array.from(out)).toEqual([1, 0, 1, 0, 1]);
  });
});

describe('parseBmhd', () => {
  it('reads HILLBACK.LBM dimensions and flags', () => {
    const d = hillback();
    // BMHD body begins at file offset 20 (FORM<8> + "BMHD"<4> + len<4> = 20).
    const bmhd = parseBmhd(d, 20);
    expect(bmhd.width).toBe(320);
    expect(bmhd.height).toBe(200);
    expect(bmhd.nPlanes).toBe(8);
    expect(bmhd.masking).toBe(0);
    expect(bmhd.compression).toBe(1); // ByteRun1
  });
});

describe('decodeLbm (HILLBACK.LBM, PBM chunky 256-colour)', () => {
  it('reads the header as a 320×200 256-colour picture', () => {
    const pic = decodeLbm(hillback());
    expect(pic.width).toBe(320);
    expect(pic.height).toBe(200);
    expect(pic.colors).toBe(256);
    expect(pic.indices.length).toBe(320 * 200);
  });

  it('decodes the CMAP to an 8-bit 256×3 palette with the right entries', () => {
    const pic = decodeLbm(hillback());
    expect(pic.palette.length).toBe(256 * 3);
    const at = (i: number): [number, number, number] => [
      pic.palette[i * 3] ?? -1,
      pic.palette[i * 3 + 1] ?? -1,
      pic.palette[i * 3 + 2] ?? -1,
    ];
    expect(at(0)).toEqual([0, 0, 0]);
    expect(at(1)).toEqual([27, 51, 0]);
    expect(at(2)).toEqual([59, 83, 0]);
    expect(at(40)).toEqual([43, 75, 0]);
    expect(at(51)).toEqual([27, 67, 27]);
    expect(at(255)).toEqual([227, 227, 195]);
    expect(Math.max(...pic.palette)).toBe(255);
  });

  it('derives palette6 = palette >> 2 (the inverse DAC expansion)', () => {
    const pic = decodeLbm(hillback());
    expect(pic.palette6.length).toBe(256 * 3);
    expect(Math.max(...pic.palette6)).toBeLessThanOrEqual(63);
    // index 255 = (227,227,195) >> 2 = (56,56,48)
    expect(pic.palette6[255 * 3]).toBe(56);
    expect(pic.palette6[255 * 3 + 1]).toBe(56);
    expect(pic.palette6[255 * 3 + 2]).toBe(48);
  });

  it('decodes the ByteRun1 BODY to exact sample pixels', () => {
    const pic = decodeLbm(hillback());
    const px = (row: number, col: number): number => pic.indices[row * pic.width + col] ?? -1;
    expect(px(0, 0)).toBe(75);
    expect(px(100, 160)).toBe(51);
    expect(px(199, 319)).toBe(118);
    expect(Array.from(pic.indices.subarray(0, 8))).toEqual([75, 48, 111, 111, 70, 83, 103, 86]);
    expect(Array.from(pic.indices.subarray(100 * 320 + 160, 100 * 320 + 168))).toEqual([
      51, 51, 84, 51, 51, 51, 51, 51,
    ]);
  });

  it('accepts a raw ArrayBuffer as well as a Uint8Array', () => {
    const bytes = hillback();
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const a = decodeLbm(ab);
    const b = decodeLbm(bytes);
    expect(a.width).toBe(b.width);
    expect(a.indices).toEqual(b.indices);
  });

  it('rejects a non-FORM buffer', () => {
    expect(() => decodeLbm(new Uint8Array([1, 2, 3, 4]))).toThrow(/not an IFF FORM/);
  });
});
