/**
 * The TUNNELI palette (TUN10.PAS:121-128), as 256 6-bit VGA RGB triples (0..63):
 *   index 64+x (x=0..64): grey (64−x)
 *   index 128+x (x=0..64): grey ((64−x)·3 div 4)   — ramp B overwrites ramp A at the shared index 128
 *   indices 68 and 132 forced black (a deliberate dark seam in each ramp)
 * Everything else is 0 (black background). The x=0 endpoint's raw 64 exceeds the 6-bit range and is
 * clamped to 63; indices below 67 are never selected (min drawn bbc is 67), so it is not visible.
 * Tag the uploaded texture SRGBColorSpace so the 6-bit→8-bit (×4) bytes land verbatim on the canvas.
 */
export function buildTunnelPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  const set = (i: number, v: number): void => {
    p[i * 3] = v;
    p[i * 3 + 1] = v;
    p[i * 3 + 2] = v;
  };
  for (let x = 0; x <= 64; x++) set(64 + x, Math.min(64 - x, 63));
  for (let x = 0; x <= 64; x++) set(128 + x, Math.min(Math.trunc(((64 - x) * 3) / 4), 63));
  set(68, 0);
  set(132, 0);
  return p;
}
