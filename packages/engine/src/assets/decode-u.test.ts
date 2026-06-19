import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeU } from './decode-u.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

/** Parse the original `FONA.INC` (Turbo Assembler `db` lines) into the raw `font` byte array. */
function parseFonaInc(): Uint8Array {
  const text = new TextDecoder().decode(fixture('FONA.INC'));
  const out: number[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('db')) continue;
    for (const tok of t.slice(2).split(',')) {
      const s = tok.trim();
      if (s.length > 0) out.push(Number.parseInt(s, 10) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

describe('decodeU — headered .U/.UH (LBM2U.C / READP.C)', () => {
  describe('HOI.U (raw hzpic picture, pixels at add*16)', () => {
    it('reads the 640×200 header', () => {
      const d = decodeU(fixture('HOI.U'));
      expect(d.magic).toBe(0xfcfc);
      expect(d.width).toBe(640);
      expect(d.height).toBe(200);
      expect(d.cols).toBe(256);
      expect(d.add).toBe(49);
    });

    it('copies the 6-bit VGA palette from offset 16 (memcpy(palette, hzpic+16, 768))', () => {
      const buf = fixture('HOI.U');
      const d = decodeU(buf);
      expect(d.palette).toHaveLength(256 * 3);
      for (let i = 0; i < 768; i++) expect(d.palette[i]).toBe(buf[16 + i]);
      for (const v of d.palette) expect(v).toBeLessThanOrEqual(63);
    });

    it('reads the raw pixels byte-exact at paragraph add (add*16 = 784), flush to EOF', () => {
      const buf = fixture('HOI.U');
      const d = decodeU(buf);
      const total = 640 * 200;
      expect(d.indices).toHaveLength(total);
      // add*16 = 784; the block runs flush to EOF (784 + 128000 === 128784 === fileSize).
      for (let i = 0; i < total; i++) expect(d.indices[i]).toBe(buf[784 + i]);
    });
  });

  describe('FONA.UH (font glyph sheet, glyphSheet read at add*16 - 1)', () => {
    it('reads the 1500×30 header', () => {
      const d = decodeU(fixture('FONA.UH'), { glyphSheet: true });
      expect(d.magic).toBe(0xfcfc);
      expect(d.width).toBe(1500);
      expect(d.height).toBe(30);
      expect(d.cols).toBe(256);
      expect(d.add).toBe(49);
    });

    it('decodes the glyph indices byte-exact against the original FONA.INC font array', () => {
      const d = decodeU(fixture('FONA.UH'), { glyphSheet: true });
      const inc = parseFonaInc();
      const total = 1500 * 30;
      expect(d.indices).toHaveLength(total);
      // FONA.INC carries one trailing pad byte (45001 vs 45000); compare the image region.
      expect(d.indices).toEqual(inc.subarray(0, total));
    });

    it('the glyph-sheet body sits one byte before add*16 (the raw FONA.INC offset)', () => {
      const buf = fixture('FONA.UH');
      const d = decodeU(buf, { glyphSheet: true });
      const total = 1500 * 30;
      for (let i = 0; i < total; i++) expect(d.indices[i]).toBe(buf[783 + i]);
    });

    it('without glyphSheet the body would read one byte later (add*16) — the picture path', () => {
      const buf = fixture('FONA.UH');
      const d = decodeU(buf); // default picture read at add*16 = 784
      const total = 1500 * 30;
      for (let i = 0; i < total; i++) expect(d.indices[i]).toBe(buf[784 + i]);
    });
  });

  describe('SRTITLE.U (RLE-compressed picture, per-row READP.C decode)', () => {
    it('reads the 320×400 header (magic 0xfcfd)', () => {
      const d = decodeU(fixture('SRTITLE.U'));
      expect(d.magic).toBe(0xfcfd);
      expect(d.width).toBe(320);
      expect(d.height).toBe(400);
      expect(d.cols).toBe(256);
    });

    it('RLE-decodes the full bitmap to width*height pixels', () => {
      const d = decodeU(fixture('SRTITLE.U'));
      expect(d.indices).toHaveLength(320 * 400);
    });

    it('decodes the title art to its known sample values (only indices 9 and 31)', () => {
      const d = decodeU(fixture('SRTITLE.U'));
      const px = (row: number, col: number): number => d.indices[row * d.width + col] ?? -1;
      expect(px(0, 0)).toBe(31);
      expect(px(399, 319)).toBe(31);
      expect(px(86, 37)).toBe(9);
      expect(Array.from(d.indices.subarray(250 * 320 + 78, 250 * 320 + 90))).toEqual([
        9, 9, 9, 9, 9, 9, 9, 31, 31, 31, 31, 31,
      ]);
      expect([...new Set(d.indices)].sort((a, b) => a - b)).toEqual([9, 31]);
    });

    it('reads the 6-bit palette from offset 16', () => {
      const buf = fixture('SRTITLE.U');
      const d = decodeU(buf);
      for (let i = 0; i < 768; i++) expect(d.palette[i]).toBe(buf[16 + i]);
      const at = (i: number): [number, number, number] => [
        d.palette[i * 3] ?? -1,
        d.palette[i * 3 + 1] ?? -1,
        d.palette[i * 3 + 2] ?? -1,
      ];
      expect(at(0)).toEqual([0, 0, 0]);
      expect(at(1)).toEqual([1, 2, 3]);
      expect(at(31)).toEqual([63, 63, 63]);
    });
  });

  it('accepts a raw ArrayBuffer as well as a Uint8Array', () => {
    const bytes = fixture('SRTITLE.U');
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    expect(decodeU(ab).indices).toEqual(decodeU(bytes).indices);
  });
});
