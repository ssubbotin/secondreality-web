// 1024-entry signed sine table, amplitude 256, truncated toward zero — a verbatim regeneration of
// GLENZ/SIN1024.INC (sin1024[i] = trunc(256 * sin(i * 2pi / 1024))). Used by the position wobble
// (oxp/oyp/ozp, MAIN.C:456-471).
const LEN = 1024;
const AMP = 256;

function build(): Int16Array {
  const t = new Int16Array(LEN);
  for (let i = 0; i < LEN; i++) {
    t[i] = Math.trunc(AMP * Math.sin((i * 2 * Math.PI) / LEN));
  }
  return t;
}

export const sin1024: Int16Array = build();

/** Index the table with an arbitrary (possibly negative or >1024) angle, matching `(a)&1023`. */
export function sinAt(angle: number): number {
  return sin1024[((angle % LEN) + LEN) & (LEN - 1)] ?? 0;
}
