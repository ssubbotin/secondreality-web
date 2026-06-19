/**
 * RIX3 / `.CLX` picture decode for the WATER part.
 *
 * Future Crew's RIX3 container (the `tausta` background `BKG.CLX` and our packaged `FONT.CLX`) is a flat
 * blob: `'RIX3'` magic, `uint16 width`, `uint16 height`, two reserved bytes, a 768-byte 6-bit VGA
 * palette (DAC values 0..63), then `width*height` palette-index pixels (top row first). This mirrors how
 * the original DOS build linked the art (`{$L bkg.obj}` / the RIX3 embedded in `MIEK.OBJ`) and read the
 * palette from `_miekka+10`, the pixels from `+778` (= 10-byte header + 768 palette).
 *
 * The engine's shared picture decoder does not exist on this branch's base commit, so this is a minimal
 * self-contained decoder living inside the part (see the part STATUS doc).
 */
export interface DecodedPicture {
  readonly width: number;
  readonly height: number;
  /** 768 bytes, 6-bit VGA DAC values (0..63); multiply by 4 for 8-bit RGB. */
  readonly palette: Uint8Array;
  /** width*height palette indices, top row first. */
  readonly pixels: Uint8Array;
}

/** Header is `'RIX3'` (4) + width (u16) + height (u16) + 2 reserved + 768-byte palette. */
const HEADER_BYTES = 10;
const PALETTE_BYTES = 768;
const PIXELS_OFFSET = HEADER_BYTES + PALETTE_BYTES; // 778

/** Decode a RIX3/.CLX blob. Throws if the magic, size, or pixel count is wrong. */
export function decodeRix(buf: ArrayBuffer | Uint8Array): DecodedPicture {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length < PIXELS_OFFSET) {
    throw new Error(`RIX3 too short: ${bytes.length} bytes`);
  }
  if (
    bytes[0] !== 0x52 || // 'R'
    bytes[1] !== 0x49 || // 'I'
    bytes[2] !== 0x58 || // 'X'
    bytes[3] !== 0x33 // '3'
  ) {
    throw new Error('not a RIX3 picture (bad magic)');
  }
  const width = (bytes[4] ?? 0) | ((bytes[5] ?? 0) << 8);
  const height = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
  const count = width * height;
  if (bytes.length < PIXELS_OFFSET + count) {
    throw new Error(`RIX3 pixel underrun: have ${bytes.length}, want ${PIXELS_OFFSET + count}`);
  }
  // Copy into freshly allocated (plain-ArrayBuffer-backed) views so the decoded data is detached from
  // the source buffer (which may be ArrayBufferLike from `fetch`).
  const palette = new Uint8Array(PALETTE_BYTES);
  palette.set(bytes.subarray(HEADER_BYTES, HEADER_BYTES + PALETTE_BYTES));
  const pixels = new Uint8Array(count);
  pixels.set(bytes.subarray(PIXELS_OFFSET, PIXELS_OFFSET + count));
  return { width, height, palette, pixels };
}
