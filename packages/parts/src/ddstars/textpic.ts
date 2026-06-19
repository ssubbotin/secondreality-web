/**
 * Decoder for the `_textpic` overlay art used by the DDSTARS "Desert Dream" text/picture reveal.
 *
 * The asset is `TEXTS.16`, produced by the original tool chain (`DOTEXTS.BAT`):
 *   lbm16 texts.lbm texts.16 2     ; reduce TEXTS.LBM to a 2-bitplane ".16"/".ux" image
 *   doobj texts.16 _textpic _textpic.obk
 * `doobj` (UTIL/DOOBJ.C) wraps the `.16` bytes verbatim into the linked-in `_textpic` symbol, so the bytes
 * `risetext` reads from `_textpic` are exactly the `TEXTS.16` bytes. We therefore decode `TEXTS.16` directly.
 *
 * The ".16"/".ux" container (GRAB/LBM16.C `savelinebuf`) is:
 *   word 0xfcfc                          ; magic
 *   word xsize, word ysize, word colors  ; here 320 × 200, colors = 16
 *   word para-add                        ; header length in paragraphs = ceil((16 + colors*3)/16)
 *   word, word, word                     ; reserved (0)
 *   colors × 3 bytes                     ; palette, already 6-bit (the loader stored `getc()/4`)
 *   'X' padding up to para-add*16 bytes
 *   then the pixels, row-major, each row = `bpls` bitplanes (here 2), each plane = xsize/8 bytes,
 *   most-significant bit of each byte = leftmost pixel; plane p contributes bit p of the index.
 *
 * For `colors = 16` the header is `ceil((16 + 48)/16) = 4` paragraphs = 64 bytes, so the pixel data begins
 * at offset 0x40 — exactly the `mov si,040h` that `risetext` (STARS.ASM) uses to skip the header.
 *
 * Cite: GRAB/LBM16.C (`savelinebuf`/`.ux` format), DDSTARS/STARS.ASM (`risetext` reads `_textpic+0x40`),
 * DDSTARS/DOTEXTS.BAT (the `bpls = 2` conversion), UTIL/DOOBJ.C (verbatim wrap into `_textpic`).
 */

/** Magic word of the ".16"/".ux" container (`0xfcfc`). */
export const TEXTPIC_MAGIC = 0xfcfc;
/** Number of bitplanes the DDSTARS `_textpic` carries (`lbm16 ... 2`). */
export const TEXTPIC_PLANES = 2;

/** A decoded `_textpic`: chunky 8-bit indices plus the embedded 6-bit VGA palette (unused by the reveal). */
export interface DecodedTextpic {
  readonly width: number;
  readonly height: number;
  readonly colors: number;
  /** Byte offset where the pixel data begins (`para-add * 16`; 0x40 for a 16-colour image). */
  readonly pixelOffset: number;
  /** Row-major chunky indices, length width × height (each in 0..(2^planes − 1)). */
  readonly indices: Uint8Array;
  /** Embedded palette as 6-bit VGA triples (0..63), length colors × 3. */
  readonly palette6: Uint8Array;
}

/** Read an unsigned little-endian 16-bit word at `off`. */
function readUint16LE(d: Uint8Array, off: number): number {
  return (d[off] ?? 0) | ((d[off + 1] ?? 0) << 8);
}

/**
 * Decode a `.16`/`.ux` (`_textpic`) buffer into chunky 8-bit indices. `planes` defaults to the DDSTARS
 * value (2). Deinterleaves the per-row bitplanes exactly as `lbm16`'s `savelinebuf` interleaved them.
 */
export function decodeTextpic(
  buffer: ArrayBuffer | Uint8Array,
  planes = TEXTPIC_PLANES,
): DecodedTextpic {
  const d = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const magic = readUint16LE(d, 0);
  if (magic !== TEXTPIC_MAGIC) {
    throw new Error(`decodeTextpic: bad magic 0x${magic.toString(16)} (expected 0xfcfc)`);
  }
  const width = readUint16LE(d, 2);
  const height = readUint16LE(d, 4);
  const colors = readUint16LE(d, 6);
  const paraAdd = readUint16LE(d, 8);
  const pixelOffset = paraAdd * 16;

  // Palette: `colors` 6-bit RGB triples following the 16-byte header.
  const palette6 = d.slice(16, 16 + colors * 3);

  // Pixels: row-major, `planes` bitplanes per row, each `width/8` bytes (LBM16 emits whole bytes).
  const rowBytes = width >> 3; // width is a multiple of 8 for these assets
  const indices = new Uint8Array(width * height);
  let src = pixelOffset;
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    for (let p = 0; p < planes; p++) {
      const bit = 1 << p;
      for (let bx = 0; bx < rowBytes; bx++) {
        const value = d[src] ?? 0;
        src++;
        const x0 = bx << 3;
        for (let k = 0; k < 8; k++) {
          if (value & (0x80 >> k)) {
            const idx = rowBase + x0 + k;
            indices[idx] = (indices[idx] ?? 0) | bit;
          }
        }
      }
    }
  }

  return { width, height, colors, pixelOffset, indices, palette6 };
}
