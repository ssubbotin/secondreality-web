/**
 * The authentic rotozoomer palette — the VGA register content the original writes for indices 0..63
 * during LENS part3 (`_LENSEXB.OBK` palette, 6-bit → 8-bit ×4). It is a triad, NOT a rainbow: black,
 * a warm cream→red-brown ramp (1..31), a dark-orange→bright-yellow band (32..47, peaking at pure
 * yellow), and a cool blue-grey band (48..63). The face image's smooth index gradient mapped through
 * this is the rotozoomer's colour — warm gradients, bright-yellow glints, or cool blue depending on
 * which index region the rotation/zoom reveals.
 */

/** Palette entry count (the rotpic uses indices 0..63). */
export const ROTO_PALETTE_SIZE = 64;

// prettier-ignore
const PALETTE: readonly number[] = [
  0, 0, 0, 240, 204, 180, 232, 192, 168, 224, 184, 156, 216, 172, 148, 212, 164, 136, 204, 156, 128,
  196, 148, 116, 188, 140, 108, 180, 128, 96, 176, 120, 88, 168, 112, 80, 164, 104, 76, 156, 96, 68,
  148, 92, 60, 144, 84, 56, 136, 76, 48, 128, 68, 40, 124, 64, 36, 116, 56, 32, 112, 52, 28, 104,
  44, 20, 96, 40, 16, 92, 32, 12, 84, 28, 12, 76, 24, 8, 72, 20, 4, 64, 16, 4, 60, 12, 0, 52, 8, 0,
  44, 4, 0, 36, 4, 0, 64, 4, 0, 76, 8, 0, 88, 16, 0, 100, 24, 0, 112, 36, 0, 128, 48, 0, 140, 60, 0,
  152, 76, 0, 164, 92, 0, 176, 112, 0, 188, 128, 0, 204, 152, 0, 216, 176, 0, 228, 200, 0, 240, 224,
  0, 252, 252, 0, 140, 144, 176, 128, 132, 164, 120, 124, 156, 108, 116, 148, 100, 108, 136, 92,
  100, 128, 84, 92, 120, 76, 84, 112, 68, 80, 104, 60, 72, 96, 52, 64, 88, 48, 60, 80, 40, 52, 72,
  32, 48, 64, 28, 40, 56, 24, 36, 48,
];

/** Build the authentic 64-entry rotozoomer palette (RGB bytes, 0..255). */
export function buildRotozoomPalette(): Uint8Array {
  return Uint8Array.from(PALETTE);
}
