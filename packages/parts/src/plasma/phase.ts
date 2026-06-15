/** The four-phase param set (k1..k4) the field samples; values in [0,4096). */
export type PhaseK = readonly [number, number, number, number];

/** moveplz per-frame deltas (COPPER.ASM:153-169): k and l (the interlaced set) advance at different rates. */
export const K_DELTAS: readonly [number, number, number, number] = [-3, -2, 1, 2];
export const L_DELTAS: readonly [number, number, number, number] = [-1, -2, 2, 3];

const wrap = (v: number): number => ((v % 4096) + 4096) % 4096;

function step(
  p: PhaseK,
  d: readonly [number, number, number, number],
): [number, number, number, number] {
  return [wrap(p[0] + d[0]), wrap(p[1] + d[1]), wrap(p[2] + d[2]), wrap(p[3] + d[3])];
}

/** Advance the k phase params one frame, wrapping each into [0,4096) (COPPER.ASM moveplz). */
export function moveplz(k: PhaseK): [number, number, number, number] {
  return step(k, K_DELTAS);
}

/** Advance the l phase params one frame (the second, scanline-interlaced parameter set). */
export function moveplzL(l: PhaseK): [number, number, number, number] {
  return step(l, L_DELTAS);
}

/** Section transition thresholds in mframes (PLZ.C:46, the leading 5 entries; final 0 = end/loop). */
export const TIMETABLE: readonly number[] = [723, 1491, 1875, 2259, 2778];

/** Per-section k reset values — the `ik` columns of inittable[][] (PLZ.C:55-60), rows 0..4. */
export const INITTABLE_K: ReadonlyArray<[number, number, number, number]> = [
  [3500, 2300, 3900, 3670],
  [1500, 2300, 3900, 1670],
  [3500, 3300, 2900, 2670],
  [3500, 2300, 3900, 3670],
  [3500, 2300, 3900, 3670],
];

/** Per-section l reset values — the `il` columns of inittable[][] (PLZ.C:55-60), rows 0..4. */
export const INITTABLE_L: ReadonlyArray<[number, number, number, number]> = [
  [1000, 2000, 3000, 4000],
  [1000, 2000, 4000, 4000],
  [3500, 1000, 3000, 1000],
  [1000, 2000, 3000, 4000],
  [1000, 2000, 3000, 4000],
];

/** How many TIMETABLE thresholds an elapsed mframe count has crossed (0..5 = current section index). */
export function sectionsPassed(mframe: number): number {
  let n = 0;
  for (const threshold of TIMETABLE) if (mframe >= threshold) n++;
  return n;
}
