/**
 * The HOI horizon picture decoder, ported from how `ALKU/MAIN.C init()` reads `hzpic`.
 *
 * `hzpic` is the incbin'd `HOI.U` — a `.U`-format picture: a 16-byte header (5 × int16 LE
 * { magic=0xFCFC, wid, hig, cols, add } then padding), a 768-byte 6-bit VGA palette, then `wid × hig`
 * raw 8-bit palette indices. `init()` takes the palette with `memcpy(palette, hzpic+16, 768)` and the
 * pixels live at paragraph `add` (`hzpic + add*16`, i.e. `16 + 768 = 784`), 640 bytes per row, drawn into
 * the field by `outline()` (`ALKU/ASMYT.ASM`).
 *
 * This is deliberately a separate read path from the engine's `decodeU` (which targets the FONA glyph
 * sheet, whose incbin'd `FONA.INC` sits one byte earlier and whose palette is unused): the horizon picture
 * must use the `hzpic+16` palette and `add*16` pixel offset exactly as `MAIN.C` does, or the sky colours
 * and the per-pixel scroll land wrong.
 */

const PALETTE_OFFSET = 16;
const PALETTE_BYTES = 256 * 3;

/** A decoded HOI horizon picture: geometry, raw palette indices, and the 6-bit VGA palette. */
export interface DecodedHoi {
  /** Picture width in pixels (`wid`; 640 for the shipped HOI.U). */
  width: number;
  /** Picture height in pixels (`hig`; 200). */
  height: number;
  /** `width × height` palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** 256 × 3 6-bit VGA RGB triples (0..63), copied from `hzpic+16` (`MAIN.C` `memcpy`). */
  palette: Uint8Array;
}

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/**
 * Decode an `HOI.U`-style `.U` horizon picture, reading the palette from offset 16 and the raw pixels from
 * paragraph `add` (`add*16`) exactly as `ALKU/MAIN.C init()` reads `hzpic`. The pixel block runs flush to
 * EOF (no per-row RLE for this asset).
 */
export function decodeHoi(buf: ArrayBuffer | Uint8Array): DecodedHoi {
  const data = toBytes(buf);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getInt16(2, true);
  const height = view.getInt16(4, true);
  const add = view.getInt16(8, true);

  const palette = new Uint8Array(PALETTE_BYTES);
  palette.set(data.subarray(PALETTE_OFFSET, PALETTE_OFFSET + PALETTE_BYTES));

  const start = add * 16;
  const total = width * height;
  const indices = new Uint8Array(total);
  indices.set(data.subarray(start, start + total));

  return { width, height, indices, palette };
}
