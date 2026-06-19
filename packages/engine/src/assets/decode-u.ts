/**
 * The canonical decoder for Future Crew's headered `.U` / `.UH` picture format (the converter
 * `LBM2U.EXE` writes — `GRAB/LBM2U.C`) and the matching runtime reader `ENDPIC/READP.C` (`readp`).
 *
 * On-disk layout (DOS 16-bit, all ints little-endian), per `LBM2U.C savelinebuf()`:
 *
 *   off 0   : 8 × int16 LE header  { magic, wid, hig, cols, add, 0, 0, 0 }   (16 bytes)
 *   off 16  : 6-bit VGA palette — `cols × 3` bytes, each component a 6-bit DAC value (0..63)
 *   off ... : pad bytes (`'X'`) up to paragraph `add` (`add * 16`)
 *   off add*16 : pixel data — either raw `wid × hig` indices (one row after another) or, when the
 *                converter compressed the body, per-row RLE rows each prefixed by an int16 byte-count.
 *
 * `readp(dst, -1, src)` copies the palette (`memcpy(dst, src + 16, cols*3)`); `readp(dst, row, src)`
 * advances to `src + add*16` and decodes one row. READP.C does not validate `magic`, so neither does this.
 *
 * Two real shapes ship in the demo, both handled here off the `add*16` pixel offset:
 *
 *   - **Raw** (`HOI.U`, `add*16 + wid*hig === fileSize`): the body is `wid*hig` flat indices. This is the
 *     `ALKU/MAIN.C` `hzpic` path (`memcpy(palette, hzpic+16, 768)`, pixels at `hzpic + add*16`).
 *   - **RLE** (`ENDPIC/SRTITLE.U`, body shorter than `wid*hig`): per-row, each row a leading int16
 *     byte-count then READP.C's inline-asm RLE (a control byte with bit 7 set is a run of `byte & 0x7f`
 *     copies of the next byte; bit 7 clear is a single literal), as `readp(row)` decodes it.
 *
 * The `FONA.UH` glyph sheet is a special case (see `glyphSheet`): the original ALKU/ENDSCRL assemble the
 * font from the raw `FONA.INC` incbin (`ALKU/INCLUDE.ASM`), not via `readp`. In the shipped `.UH` that
 * `font` body sits one byte before `add*16` (a converter paragraph quirk: `FONA.INC` matches `.UH`
 * bytes `[add*16 - 1 …]` byte-for-byte, where `add*16` would drop the first row's leading pixel). Pass
 * `glyphSheet: true` to read at `add*16 - 1` so the segmentation lands exactly as the original font array.
 */

/** A decoded headered `.U`/`.UH` picture. */
export interface DecodedU {
  /** The header `magic` word (`0xfcfc` for the raw pictures, `0xfcfd` for SRTITLE.U). Kept for callers. */
  magic: number;
  /** Picture width in pixels (`wid`). */
  width: number;
  /** Picture height in pixels (`hig`). */
  height: number;
  /** Declared colour count from the header (`cols`; 256 for these assets). */
  cols: number;
  /** The `add` header field — the pixel-data paragraph (`add * 16` is the byte offset). */
  add: number;
  /** `width × height` palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** `256 × 3` 6-bit VGA RGB triples (0..63), copied from offset 16 (`readp(-1)` / `memcpy(…, src+16)`). */
  palette: Uint8Array;
}

/** Options for {@link decodeU}. */
export interface DecodeUOptions {
  /**
   * Read the `FONA.UH` glyph sheet at `add*16 - 1` (the original raw `FONA.INC` `font` body offset)
   * instead of the format's `add*16` picture offset. Default `false` (the `readp`/`hzpic` picture path).
   */
  glyphSheet?: boolean;
}

const PALETTE_OFFSET = 16;
const PALETTE_BYTES = 256 * 3;

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
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

/** Return exactly `256 × 3` 6-bit palette bytes, zero-padded if the source is short. */
function padPalette(palette: Uint8Array): Uint8Array {
  if (palette.length === PALETTE_BYTES) return palette.slice();
  const out = new Uint8Array(PALETTE_BYTES);
  out.set(palette.subarray(0, PALETTE_BYTES));
  return out;
}

/**
 * Decode a headered `.U`/`.UH` picture (`LBM2U.EXE` output / `READP.C` reader) into geometry, the
 * `width × height` palette indices and the 256-colour 6-bit VGA palette. Raw and RLE bodies are detected
 * from the file size; pass `glyphSheet` for the `FONA.UH` font sheet (see the module docs).
 */
export function decodeU(buf: ArrayBuffer | Uint8Array, opts: DecodeUOptions = {}): DecodedU {
  const d = toBytes(buf);
  const magic = readUint16LE(d, 0);
  const width = readInt16LE(d, 2);
  const height = readInt16LE(d, 4);
  const cols = readInt16LE(d, 6);
  const add = readInt16LE(d, 8);

  // readp(palette, -1, src): memcpy(dst, src + 16, cols*3). The on-disk file always carries the full
  // 256-entry table; we return all 768 bytes regardless of the declared `cols`.
  const palette = padPalette(d.subarray(PALETTE_OFFSET, PALETTE_OFFSET + PALETTE_BYTES));

  const total = width * height;
  const indices = new Uint8Array(total);
  const pixelStart = add * 16;

  // Raw body: `wid*hig` flat indices flush against EOF (HOI.U) — or, for the FONA glyph sheet, the raw
  // `FONA.INC` font body one byte earlier (`add*16 - 1`). Detected via `add*16 + total === fileSize`.
  if (pixelStart + total === d.length) {
    const start = opts.glyphSheet ? pixelStart - 1 : pixelStart;
    indices.set(d.subarray(start, start + total));
    return { magic, width, height, cols, add, indices, palette };
  }

  // RLE body (SRTITLE.U): per-row int16 byte-count then READP.C's run/literal RLE, decoded from `add*16`.
  let cursor = pixelStart;
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

  return { magic, width, height, cols, add, indices, palette };
}
