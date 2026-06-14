export interface SyncChannels {
  /** np_zinfo: set only by the ScreamTracker-3 Zxx command. The shipped FC modules carry none, so 0. */
  muscode: number;
  /** dis_musplus(): the clamped signed row-distance DX, range [-32, +32]. The dominant primitive parts poll. */
  musplus: number;
  /** np_row: the current within-pattern row (parts use musrow & 7 for the beat). */
  musrow: number;
}

/**
 * dis_musplus() — the signed countdown the parts actually compare against (GLENZ `<-19`,
 * TECHNO `<-4`, PLZPART `<13`, LENS `<-6/<-20`, WATER `cmp dx,-11`, ...). It is NOT a raw player
 * global: the DIS service muscode_6 computes register DX live from the row, clamped to [-32, +32],
 * using np_zplus (0..3) only as a phase selector. Reproduced verbatim from DIS/DISINT.ASM:252-271:
 *
 *   zplus 0  -> -32                       (no +++ marker in play; parked)
 *   zplus 1  -> max(row-64, -32)          (+++ ahead: parked at -32, then counting down to the next marker)
 *   zplus 2  -> row<32 ? row : -32        (+++ behind: counting up from the last marker, then parked at -32)
 *   zplus 3  -> row>32 ? max(row-64,-32) : (row<32 ? row : -32)   (markers both sides; symmetric)
 *
 * zplus==3 (the common case for a section bracketed by +++ markers) reduces to the familiar
 * `row<32 ? row : row-64`, which is why a naive bar-distance "mostly works by ear".
 */
export function computeMusplus(zplus: number, row: number): number {
  switch (zplus) {
    case 1:
      return Math.max(row - 64, -32);
    case 2:
      return row < 32 ? row : -32;
    case 3:
      return row > 32 ? Math.max(row - 64, -32) : row < 32 ? row : -32;
    default:
      return -32; // zplus 0 (or unknown)
  }
}

/**
 * Reproduce the DIS muscode_6 channels from the live within-pattern row.
 *
 * `muscode` (np_zinfo) is set only by the ST3 Zxx command — both shipped modules (MUSIC0/MUSIC1)
 * carry zero Zxx, so it holds its initial 0. `musrow` is the raw row. `musplus` is computed from
 * the row via {@link computeMusplus}; `zplus` defaults to 3 — the value for a section bracketed by
 * `+++` order markers (the dominant case). Deriving the true per-order `zplus` from the module's
 * `+++` order-list markers is deferred until effects consume musplus and the order-list mapping can
 * be confirmed by ear (libopenmpt collapses `+++` entries — see DIS/DISINT.ASM:252-271, STMIK 0x442d).
 */
export function reconstructSync(row: number, zplus = 3): SyncChannels {
  return { muscode: 0, musplus: computeMusplus(zplus, row), musrow: row };
}
