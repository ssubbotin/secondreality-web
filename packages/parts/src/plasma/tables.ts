/**
 * Verbatim sine tables for the PLZPART plasma, regenerated from PLZ.C init_plz's DO_TABLES block
 * (lines 137-167). DPII = 2π. C truncates double→int on assignment; typed-array stores reproduce
 * the original byte/word wrap (psini is `char`, lsini* are unsigned `word` used as address offsets).
 */
export const TWO_PI = Math.PI * 2;

/** psini[a] = trunc(sin(w)·55 + sin(6w)·5 + sin(21w)·4 + 64), a∈[0,16384), w = a·2π/4096. */
export function buildPsini(): Uint8Array {
  const t = new Uint8Array(16384);
  for (let a = 0; a < 16384; a++) {
    const w = (a * TWO_PI) / 4096;
    t[a] = Math.trunc(Math.sin(w) * 55 + Math.sin(w * 6) * 5 + Math.sin(w * 21) * 4 + 64);
  }
  return t;
}

/** lsini4[a] = trunc((sin(w)·55 + sin(5w)·8 + sin(15w)·2 + 64)·8), a∈[0,8192). */
export function buildLsini4(): Uint16Array {
  const t = new Uint16Array(8192);
  for (let a = 0; a < 8192; a++) {
    const w = (a * TWO_PI) / 4096;
    t[a] = Math.trunc((Math.sin(w) * 55 + Math.sin(w * 5) * 8 + Math.sin(w * 15) * 2 + 64) * 8);
  }
  return t;
}

/** lsini16[a] = trunc((sin(w)·55 + sin(4w)·5 + sin(17w)·3 + 64)·16), a∈[0,8192). */
export function buildLsini16(): Uint16Array {
  const t = new Uint16Array(8192);
  for (let a = 0; a < 8192; a++) {
    const w = (a * TWO_PI) / 4096;
    t[a] = Math.trunc((Math.sin(w) * 55 + Math.sin(w * 4) * 5 + Math.sin(w * 17) * 3 + 64) * 16);
  }
  return t;
}

/** ptau[0]=0; ptau[a] = trunc(cos(a·2π/128 + π)·31 + 32) for a∈[1,128]; a 0..64 ramps 0..63. */
export function buildPtau(): Uint8Array {
  const t = new Uint8Array(256);
  t[0] = 0;
  for (let a = 1; a <= 128; a++) {
    t[a] = Math.trunc(Math.cos((a * TWO_PI) / 128 + Math.PI) * 31 + 32);
  }
  return t;
}
