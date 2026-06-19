/**
 * Decoder for Future Crew's `.U` / `.UH` picture format (the converter `LBM2U.EXE` writes), used here
 * for the ENDSCRL glyph sheet `FONA.UH`.
 *
 * Layout (verified against `ENDSCRL/FONA.UH`):
 *
 *   off 0   : 5 × int16 LE header  { magic = 0xFCFC, wid, hig, cols, add }
 *   off 10  : 6-bit VGA palette (256 colours × 3 = 768 bytes; values 0..63)
 *   off ... : pixel data — `wid × hig` palette indices, row-major, top row first
 *
 * The shipped `FONA.UH` stores the pixel data uncompressed: after the palette come 5 bytes of
 * `add`-related metadata, then the `wid × hig` raw indices, then a single trailing pad byte (so the raw
 * pixel block ends exactly one byte before EOF). This decoder handles both: if the file's tail matches an
 * exact raw block it copies it, otherwise it RLE-decodes from the end of the canonical 768-byte palette (a
 * control byte with bit7 set introduces a run of the following byte, bit7 clear a literal copy).
 *
 * This is a self-contained copy because the branch predates `@sr/engine`'s shared text/asset layer; prefer
 * the engine `decodeU` once the branch is rebased onto a commit that exports it (see STATUS deferred note).
 */
export interface DecodedU {
  /** Picture width in pixels. */
  width: number;
  /** Picture height in pixels. */
  height: number;
  /** Declared colour count from the header (256 for these assets). */
  cols: number;
  /** The `add` header field (the original's colour-offset; preserved for completeness). */
  add: number;
  /** `width × height` palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** 256 × 3 6-bit VGA RGB triples (0..63). */
  palette: Uint8Array;
}

const HEADER_BYTES = 10;
const PALETTE_BYTES = 256 * 3;

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

export function decodeU(buf: ArrayBuffer | Uint8Array): DecodedU {
  const data = toBytes(buf);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // 5 × int16 LE: magic, wid, hig, cols, add.
  const width = view.getInt16(2, true);
  const height = view.getInt16(4, true);
  const cols = view.getInt16(6, true);
  const add = view.getInt16(8, true);

  const palette = data.subarray(HEADER_BYTES, HEADER_BYTES + PALETTE_BYTES);

  const total = width * height;
  const indices = new Uint8Array(total);

  // Raw fast-path: the uncompressed block sits flush against EOF with a single trailing pad byte, i.e.
  // `pixelStart + total + 1 === fileSize` (verified for FONA.UH). When the geometry doesn't fit that raw
  // layout, fall through to the RLE decode from the canonical palette end.
  const rawStart = data.length - total - 1;
  if (rawStart >= HEADER_BYTES + PALETTE_BYTES) {
    indices.set(data.subarray(rawStart, rawStart + total));
    return { width, height, cols, add, indices, palette: padPalette(palette) };
  }

  // Per-row RLE decode.
  let off = HEADER_BYTES + PALETTE_BYTES;
  let out = 0;
  while (out < total && off < data.length) {
    const ctrl = data[off++] ?? 0;
    if (ctrl & 0x80) {
      const run = ctrl & 0x7f;
      const value = data[off++] ?? 0;
      for (let i = 0; i < run && out < total; i++) indices[out++] = value;
    } else {
      for (let i = 0; i < ctrl && out < total; i++) indices[out++] = data[off++] ?? 0;
    }
  }
  return { width, height, cols, add, indices, palette: padPalette(palette) };
}

/** Return exactly 256 × 3 palette bytes, zero-padded if the source is short. */
function padPalette(palette: Uint8Array): Uint8Array {
  if (palette.length === PALETTE_BYTES) return palette.slice();
  const out = new Uint8Array(PALETTE_BYTES);
  out.set(palette.subarray(0, PALETTE_BYTES));
  return out;
}
