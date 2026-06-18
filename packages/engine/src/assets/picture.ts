/**
 * Decoder for the demo's runtime picture format (`.U`), ported verbatim from the original reader
 * `ENDPIC/READP.C`. A `.U` file is a small header + a 6-bit VGA palette + per-row RLE-compressed 8-bit
 * indexed pixels.
 *
 * On-disk layout (DOS 16-bit, all ints little-endian):
 *   struct st_readp { int magic; int wid; int hig; int cols; int add; };  // 5 × int16 = 10 bytes
 *   bytes 0..9    header
 *   bytes 16..    palette: `cols × 3` bytes, each component a 6-bit VGA DAC value (0..63)
 *   bytes add*16  per-row RLE pixel data (`hig` rows)
 *
 * `readp(dst, -1, src)` copies the palette (`memcpy(dst, src+16, cols*3)`); `readp(dst, row, src)`
 * decodes one row. READP.C does not validate `magic`, so neither does this decoder.
 */

export interface DecodedPicture {
  /** The header `magic` word (e.g. 0xfcfd for SRTITLE.U). Not validated — kept for callers. */
  magic: number;
  /** Picture width in pixels (`wid`). */
  width: number;
  /** Picture height in pixels (`hig`). */
  height: number;
  /** Palette entry count (`cols`, typically 256). */
  colors: number;
  /** `width * height` 8-bit palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** `colors * 3` raw 6-bit (0..63) VGA RGB triples, exactly as stored. */
  palette6: Uint8Array;
  /** `colors * 3` 8-bit (0..252) VGA RGB triples — `palette6 << 2` (the faithful DAC expansion). */
  palette: Uint8Array;
}

/** Expand 6-bit VGA DAC components (0..63) to 8-bit (0..252) with `v << 2`, the repo-wide convention. */
export function expandVgaPalette(palette6: Uint8Array): Uint8Array {
  const out = new Uint8Array(palette6.length);
  for (let i = 0; i < palette6.length; i++) out[i] = (palette6[i] ?? 0) << 2;
  return out;
}

/** Read a signed little-endian 16-bit int at `off` (matches DOS `*(int *)` reads in READP.C). */
function readInt16LE(d: Uint8Array, off: number): number {
  const lo = d[off] ?? 0;
  const hi = d[off + 1] ?? 0;
  const v = lo | (hi << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/** Read an unsigned little-endian 16-bit int at `off` (used for the magic word). */
function readUint16LE(d: Uint8Array, off: number): number {
  return (d[off] ?? 0) | ((d[off + 1] ?? 0) << 8);
}

/**
 * Decode a `.U` picture. Ports READP.C: the palette via `readp(-1)` and every row via `readp(row)`'s
 * inline-asm RLE (a byte with bit 7 set is a run of `byte & 0x7f` copies of the next byte; otherwise a
 * literal), advancing through the row-length words exactly as the original `while(row)` skip loop.
 */
export function decodePicture(buffer: ArrayBuffer | Uint8Array): DecodedPicture {
  const d = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const magic = readUint16LE(d, 0);
  const width = readInt16LE(d, 2);
  const height = readInt16LE(d, 4);
  const colors = readInt16LE(d, 6);
  const add = readInt16LE(d, 8);

  // readp(palette, -1, src): memcpy(dst, src + 16, cols*3)
  const palette6 = d.slice(16, 16 + colors * 3);

  const indices = new Uint8Array(width * height);

  // Row data begins at paragraph `add` (add*16). Each row is prefixed by an int16 byte-count; the
  // `while(row)` loop in READP.C skips earlier rows by reading that count and stepping over it.
  let cursor = add * 16;
  for (let row = 0; row < height; row++) {
    const bytes = readInt16LE(d, cursor);
    cursor += 2;
    const end = cursor + bytes;
    let dst = row * width;
    let si = cursor;
    while (si < end) {
      const al = d[si] ?? 0;
      si++;
      if (al & 0x80) {
        // run: count in the low 7 bits, value is the next byte
        let count = al & 0x7f;
        const value = d[si] ?? 0;
        si++;
        while (count > 0) {
          indices[dst] = value;
          dst++;
          count--;
        }
      } else {
        // literal
        indices[dst] = al;
        dst++;
      }
    }
    cursor = end;
  }

  return { magic, width, height, colors, indices, palette6, palette: expandVgaPalette(palette6) };
}
