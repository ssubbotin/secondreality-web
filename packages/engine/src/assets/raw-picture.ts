/**
 * Decoder for the demo's *un-headered* raw picture format — a flat buffer of 8-bit VGA palette indices
 * with no header and no embedded palette (the palette ships separately, e.g. `MONSTER.PAL`, or is built by
 * the part). This is the `read(fff, kuva, 64000)` style load the original uses for full-screen 320×200
 * mode-13h/mode-X images (e.g. `PANIC/SHUTDOWN.C`'s `MONSTER.U`, `LENS`'s `LENS.U`), distinct from the
 * headered `.U`/`.UH` format decoded by `decodeU` / `decodePicture`.
 *
 * `decodeRawPicture` simply validates the length and returns a fresh copy of the first `size` bytes, so the
 * caller owns an independent buffer (the original read straight into a fixed VGA-page array).
 */

/** A full-screen 320×200 mode-13h / mode-X raw page = 64000 bytes. */
export const RAW_320x200 = 320 * 200;

/**
 * Copy the first `size` bytes of `bytes` into a fresh `Uint8Array(size)`. Throws if `bytes` is shorter than
 * `size` (a truncated/missing asset). `size` defaults to a 320×200 page ({@link RAW_320x200}).
 */
export function decodeRawPicture(bytes: Uint8Array, size: number = RAW_320x200): Uint8Array {
  if (bytes.length < size) {
    throw new Error(`decodeRawPicture: buffer too short: ${bytes.length} < ${size}`);
  }
  return bytes.slice(0, size);
}
