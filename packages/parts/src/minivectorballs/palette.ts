/**
 * The DOTS palette (MAIN.C, programmed straight into the VGA DAC), built as 256 6-bit RGB triples
 * (0..63), row-major. Three ranges:
 *
 *   indices 0..63   — the ball colour ramp: index a*4+b for a∈[0,16), b∈[0,4). The four channels `b`
 *                     come from `cols[] = {0,0,0, 4,25,30, 8,40,45, 16,55,60}`; the R component is the
 *                     raw channel base, G/B are scaled by a brightness `c = 100 + a*9` (G = cols.G*c/256,
 *                     B = cols.B*c/256). The depth tables select `b∈{2,3}` at brightness level `a = g`.
 *   indices 64..163 — the floor/shadow grey ramp: grey `(c/4)` with `c = ((64 − 256/(a+4))^2) / 64`
 *                     (C integer division throughout). The ball shadows plot index 87 (mid-grey 11).
 *   index 255       — debug magenta (31,0,15); never drawn by the effect, kept for fidelity.
 *
 * All other indices are 0 (black). C `int` division truncates toward zero. Values are 6-bit; the GPU
 * LUT scales ×4 to 8-bit and tags the texture SRGBColorSpace so the VGA DAC bytes land verbatim.
 */

const COLS = [0, 0, 0, 4, 25, 30, 8, 40, 45, 16, 55, 60] as const;
const tr = (x: number): number => Math.trunc(x);

export function buildBallPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  const set = (i: number, r: number, g: number, b: number): void => {
    p[i * 3] = r;
    p[i * 3 + 1] = g;
    p[i * 3 + 2] = b;
  };

  // Ball colour ramp: indices 0..63 (a*4+b), DAC auto-incrementing in the original.
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 4; b++) {
      const c = 100 + a * 9;
      const r = COLS[b * 3] ?? 0;
      const g = tr(((COLS[b * 3 + 1] ?? 0) * c) / 256);
      const bl = tr(((COLS[b * 3 + 2] ?? 0) * c) / 256);
      set(a * 4 + b, r, g, bl);
    }
  }

  // Floor/shadow grey ramp: indices 64..163.
  for (let a = 0; a < 100; a++) {
    let c = 64 - tr(256 / (a + 4));
    c = tr((c * c) / 64);
    const v = tr(c / 4);
    set(64 + a, v, v, v);
  }

  // Debug index 255 (dropped from the visible output, kept verbatim).
  set(255, 31, 0, 15);
  return p;
}
