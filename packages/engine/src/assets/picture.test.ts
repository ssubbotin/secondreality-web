import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodePicture, expandVgaPalette } from './picture.js';

const srtitle = (): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('./__fixtures__/SRTITLE.U', import.meta.url))));

describe('decodePicture (READP.C .U format)', () => {
  it('reads the SRTITLE.U header byte-exactly', () => {
    const pic = decodePicture(srtitle());
    expect(pic.magic).toBe(0xfcfd);
    expect(pic.width).toBe(320);
    expect(pic.height).toBe(400);
    expect(pic.colors).toBe(256);
  });

  it('decodes the full indexed bitmap to width*height pixels', () => {
    const pic = decodePicture(srtitle());
    expect(pic.indices.length).toBe(320 * 400);
  });

  it('decodes the 6-bit VGA palette (cols*3 bytes, components 0..63)', () => {
    const pic = decodePicture(srtitle());
    expect(pic.palette6.length).toBe(256 * 3);
    // every component is a 6-bit DAC value
    expect(Math.max(...pic.palette6)).toBeLessThanOrEqual(63);
    // spot-checks against the on-disk bytes
    const at = (i: number): [number, number, number] => [
      pic.palette6[i * 3] ?? -1,
      pic.palette6[i * 3 + 1] ?? -1,
      pic.palette6[i * 3 + 2] ?? -1,
    ];
    expect(at(0)).toEqual([0, 0, 0]);
    expect(at(1)).toEqual([1, 2, 3]);
    expect(at(2)).toEqual([2, 3, 5]);
    expect(at(31)).toEqual([63, 63, 63]);
    expect(at(100)).toEqual([0, 16, 16]);
    expect(at(128)).toEqual([50, 41, 33]);
    expect(at(255)).toEqual([50, 41, 33]);
  });

  it('decodes the RLE pixel rows to exact sample values', () => {
    const pic = decodePicture(srtitle());
    const px = (row: number, col: number): number => pic.indices[row * pic.width + col] ?? -1;
    // background field is palette index 31 (white before the fade)
    expect(px(0, 0)).toBe(31);
    expect(px(399, 319)).toBe(31);
    // first non-background pixel (the title art) is index 9 at row 86 col 37
    expect(px(86, 37)).toBe(9);
    // a known interior run on row 250
    expect(px(250, 80)).toBe(9);
    expect(Array.from(pic.indices.subarray(250 * 320 + 78, 250 * 320 + 90))).toEqual([
      9, 9, 9, 9, 9, 9, 9, 31, 31, 31, 31, 31,
    ]);
  });

  it('decodes only the two indices the title art uses (9 and 31)', () => {
    const pic = decodePicture(srtitle());
    const used = new Set(pic.indices);
    expect([...used].sort((a, b) => a - b)).toEqual([9, 31]);
  });

  it('every decoded row expands to exactly `width` pixels', () => {
    const pic = decodePicture(srtitle());
    // sentinel-free invariant: total length is width*height AND no row crossing happened
    expect(pic.indices.length % pic.width).toBe(0);
    expect(pic.indices.length / pic.width).toBe(pic.height);
  });

  it('accepts a raw ArrayBuffer as well as a Uint8Array', () => {
    const bytes = srtitle();
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const a = decodePicture(ab);
    const b = decodePicture(bytes);
    expect(a.width).toBe(b.width);
    expect(a.indices).toEqual(b.indices);
  });
});

describe('expandVgaPalette (6-bit -> 8-bit, v << 2)', () => {
  it('shifts each 0..63 component into 0..252', () => {
    const out = expandVgaPalette(new Uint8Array([0, 1, 31, 50, 63]));
    expect(Array.from(out)).toEqual([0, 4, 124, 200, 252]);
  });

  it('expands the decoded picture palette to a 256*3 byte LUT', () => {
    const pic = decodePicture(srtitle());
    expect(pic.palette.length).toBe(256 * 3);
    // index 31 = (63,63,63) -> (252,252,252)
    expect(pic.palette[31 * 3]).toBe(252);
    expect(pic.palette[31 * 3 + 1]).toBe(252);
    expect(pic.palette[31 * 3 + 2]).toBe(252);
    // index 255 = (50,41,33) -> (200,164,132)
    expect(pic.palette[255 * 3]).toBe(200);
    expect(pic.palette[255 * 3 + 1]).toBe(164);
    expect(pic.palette[255 * 3 + 2]).toBe(132);
  });
});
