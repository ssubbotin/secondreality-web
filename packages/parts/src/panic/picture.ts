import { decodeRawPicture } from '@sr/engine';

/**
 * The PANIC picture. `MONSTER.U` is NOT the headered RLE `.U`/`.UH` picture format — `SHUTDOWN.C` reads it
 * as a flat 64000-byte buffer (`read(fff,kuva,64000)`), i.e. a raw 320×200 8-bit palette-index image (the
 * engine's un-headered raw-picture format, decoded by `decodeRawPicture`). It is laid into VGA memory at
 * `(x+320, y*2)`/`(x+320, y*2+1)` (each source row doubled into the stretched 640×400 planar display); for
 * the web port we keep the native 320×200 indices and reproduce the displayed image directly.
 */
export const MONSTER_W = 320;
export const MONSTER_H = 200;
export const MONSTER_SIZE = MONSTER_W * MONSTER_H; // 64000

/** Copy the raw 320×200 index buffer into a fresh `Uint8Array(64000)` (the engine raw-picture decoder). */
export function parsePicture(bytes: Uint8Array): Uint8Array {
  return decodeRawPicture(bytes, MONSTER_SIZE);
}
