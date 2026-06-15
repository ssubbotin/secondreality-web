/** The four-phase param set (k1..k4) the field samples; values in [0,4096). */
export type PhaseK = readonly [number, number, number, number];

/** moveplz per-frame deltas for k1..k4 (COPPER.ASM:153-160). */
export const K_DELTAS: readonly [number, number, number, number] = [-3, -2, 1, 2];

/** Advance the k phase params one frame, wrapping each into [0,4096) (COPPER.ASM moveplz). */
export function moveplz(k: PhaseK): [number, number, number, number] {
  return [
    (((k[0] + K_DELTAS[0]) % 4096) + 4096) % 4096,
    (((k[1] + K_DELTAS[1]) % 4096) + 4096) % 4096,
    (((k[2] + K_DELTAS[2]) % 4096) + 4096) % 4096,
    (((k[3] + K_DELTAS[3]) % 4096) + 4096) % 4096,
  ];
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

/** How many TIMETABLE thresholds an elapsed mframe count has crossed (0..5 = current section index). */
export function sectionsPassed(mframe: number): number {
  let n = 0;
  for (const threshold of TIMETABLE) if (mframe >= threshold) n++;
  return n;
}
