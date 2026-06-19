// Flat-shade lighting ported from VISU/ADRAW.ASM (calclight / normallight) and the face-flag handling in
// draw_polylist. Each face's rendered palette index = baseColor + calclight(faceNormal, shadeBits). The
// gouraud faces in the ships are rendered flat (the face normal, not per-vertex normals) — a documented
// simplification; the shade *mode* (16 vs 32, i.e. the fade-ramp length) is still honoured per face.

/** Object-/face-flag bits (CD.H, in the full 16-bit flag word). */
export const F_VISIBLE = 0x0001;
export const F_FLIP = 0x0100;
export const F_2SIDE = 0x0200;
export const F_SHADE8 = 0x0400;
export const F_SHADE16 = 0x0800;
export const F_SHADE32 = 0x0c00;
export const F_GOURAUD = 0x1000;
export const F_SHADE_MASK = 0x0c00;

/** The fixed light direction (ADRAW.ASM `newlight`). */
export const NEWLIGHT = { x: 12118, y: 10603, z: 3030 } as const;

/**
 * normallight (ADRAW.ASM): brightness 0..255 from a rotated face normal. The asm forms the 32-bit dot
 * `n.newlight` in dx:ax, takes the high word `dx`, `sar` it by 5 (= 2*UNITSHR-7-16 = 28-23 = 5), adds 128,
 * clamps to 0..255.
 */
export function normalLight(nx: number, ny: number, nz: number): number {
  const dot = nx * NEWLIGHT.x + ny * NEWLIGHT.y + nz * NEWLIGHT.z;
  // High 16 bits of the 32-bit product (two's complement), then arithmetic >> 5.
  let dx = (dot >> 16) & 0xffff;
  if (dx >= 0x8000) dx -= 0x10000;
  let ax = (dx >> 5) + 128;
  if (ax > 255) ax = 255;
  if (ax < 0) ax = 0;
  return ax;
}

/**
 * calclight (ADRAW.ASM): a face's shade offset 1..30 within its material fade ramp. The shade bits select
 * the right shift: F_SHADE32 -> >>3, F_SHADE16 -> >>4, F_SHADE8 -> >>5. With no shade bits the offset is 0
 * (`@@nc`: xor ax,ax). Result clamped to [1,30] when shaded.
 */
export function calcLight(nx: number, ny: number, nz: number, flags: number): number {
  const shade = flags & F_SHADE_MASK;
  if (shade === 0) return 0;
  const b = normalLight(nx, ny, nz);
  const cl = 6 - (shade >> 10); // F_SHADE32(0xC00)>>10=3 -> cl=3 ; F_SHADE16 -> 4 ; F_SHADE8 -> 5
  let ax = b >> cl;
  if (ax < 1) ax = 1;
  if (ax > 30) ax = 30;
  return ax;
}

/**
 * Reconstruct a face's effective flag word the way draw_polylist does:
 * `(objectFlags | 0x0f00) & ((faceFlagByte<<8) | F_VISIBLE)`. The per-face polydata byte is the high
 * byte of the original 16-bit flag (carrying the shade / two-sided / gouraud bits), so shifting it up by 8
 * recovers them. F_DEFAULT (0xf001) is the object default.
 */
export function effectiveFaceFlags(faceFlagByte: number, objectFlags = 0xf001): number {
  const faceWord = (faceFlagByte << 8) | F_VISIBLE;
  return (objectFlags | 0x0f00) & faceWord;
}
