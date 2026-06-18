// 1024-entry signed sine table, amplitude 256, truncated toward zero — a faithful regeneration of
// DOTS/SIN1024.INC (sin1024[i] = trunc(256 * sin(i * 2pi / 1024))). Byte-identical to TECHNO/SIN1024.INC.
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

/** MAIN.C `isin(deg) = sin1024[deg & 1023]` — wraps any (possibly negative or >1024) angle. */
export function isin(deg: number): number {
  return sin1024[((deg % LEN) + LEN) & (LEN - 1)] ?? 0;
}

/** MAIN.C `icos(deg) = sin1024[(deg + 256) & 1023]` — sine shifted a quarter period. */
export function icos(deg: number): number {
  return sin1024[(((deg + 256) % LEN) + LEN) & (LEN - 1)] ?? 0;
}
