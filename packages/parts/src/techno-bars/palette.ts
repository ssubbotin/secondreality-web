const trunc = Math.trunc;

function popcount4(a: number): number {
  return (a & 1) + ((a >> 1) & 1) + ((a >> 2) & 1) + ((a >> 3) & 1);
}

type RGB = readonly [number, number, number];

const BLACK: RGB = [0, 0, 0];

// Base purples by overlap count (KOE.C switch on x = popcount(a)).
const BASE: ReadonlyArray<RGB> = [
  BLACK,
  [trunc((38 * 64) / 111), trunc((33 * 64) / 111), trunc((44 * 64) / 111)],
  [trunc((52 * 64) / 111), trunc((45 * 64) / 111), trunc((58 * 64) / 111)],
  [trunc((67 * 64) / 111), trunc((61 * 64) / 111), trunc((73 * 64) / 111)],
  [trunc((83 * 64) / 111), trunc((77 * 64) / 111), trunc((89 * 64) / 111)],
];

/** [16 brightness c][16 overlap a][3 rgb], values 0..63. */
export function buildTechnoPalette(): Uint8Array {
  const out = new Uint8Array(16 * 16 * 3);
  for (let c = 0; c < 16; c++) {
    for (let a = 0; a < 16; a++) {
      const base = BASE[popcount4(a)] ?? BLACK;
      // KOE.C scales each channel by a different ramp of c, then clamps to 63.
      const r = Math.min(63, trunc((base[0] * (10 + trunc((c * 9) / 9))) / 10));
      const g = Math.min(63, trunc((base[1] * (10 + trunc((c * 7) / 9))) / 10));
      const b = Math.min(63, trunc((base[2] * (10 + trunc((c * 5) / 9))) / 10));
      const i = (c * 16 + a) * 3;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  return out;
}

/** Read one [c][a] entry as an [r,g,b] tuple (0..63). */
export function paletteRGB(pal: Uint8Array, c: number, a: number): [number, number, number] {
  const i = (c * 16 + a) * 3;
  return [pal[i] ?? 0, pal[i + 1] ?? 0, pal[i + 2] ?? 0];
}
