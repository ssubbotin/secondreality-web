/**
 * Picture-oriented wrapper over the canonical headered `.U` decoder ({@link decodeU}). Ports the original
 * runtime reader `ENDPIC/READP.C`: a `.U` file is a small header + a 6-bit VGA palette + per-row
 * RLE-compressed (or raw) 8-bit indexed pixels. This adds the picture-facing shape callers like ENDPIC
 * expect — the `magic` word, the 6-bit palette and its 8-bit DAC expansion.
 *
 * The on-disk layout and the raw/RLE handling live in `./decode-u.ts`; see that module for the full format
 * notes. READP.C does not validate `magic`, so neither does this decoder.
 */

import { decodeU } from './decode-u.js';

/** Expand 6-bit VGA DAC components (0..63) to 8-bit (0..252) with `v << 2`, the repo-wide convention. */
export function expandVgaPalette(palette6: Uint8Array): Uint8Array {
  const out = new Uint8Array(palette6.length);
  for (let i = 0; i < palette6.length; i++) out[i] = (palette6[i] ?? 0) << 2;
  return out;
}

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
  /** `256 * 3` raw 6-bit (0..63) VGA RGB triples, exactly as stored. */
  palette6: Uint8Array;
  /** `256 * 3` 8-bit (0..252) VGA RGB triples — `palette6 << 2` (the faithful DAC expansion). */
  palette: Uint8Array;
}

/**
 * Decode a `.U` picture into the picture-facing {@link DecodedPicture} shape. Delegates the header/palette
 * parse and the raw-or-RLE pixel decode to {@link decodeU}, then exposes the `magic` word and both the
 * 6-bit palette and its 8-bit DAC expansion.
 */
export function decodePicture(buffer: ArrayBuffer | Uint8Array): DecodedPicture {
  const decoded = decodeU(buffer);
  return {
    magic: decoded.magic,
    width: decoded.width,
    height: decoded.height,
    colors: decoded.cols,
    indices: decoded.indices,
    palette6: decoded.palette,
    palette: expandVgaPalette(decoded.palette),
  };
}
