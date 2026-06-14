import { absRowOf, type MarkerTable } from './marker-table.js';

export interface SyncChannels {
  /** np_zinfo: the most recent Zxx code at-or-before the current position (0 = none yet). */
  muscode: number;
  /** np_zplus-derived: signed distance to the nearest bar boundary, [-32, +31]. The dominant primitive parts poll. */
  musplus: number;
  /** np_row: the current within-pattern row (parts use musrow & 7 for the beat). */
  musrow: number;
}

const ROWS_PER_PATTERN = 64;

/**
 * Signed distance to the nearest bar (pattern) boundary: positive = rows since the last bar,
 * negative = rows until the next. Range [-rowsPerPattern/2, +rowsPerPattern/2 - 1].
 * Reproduces the original musplus thresholds (GLENZ -19, TECHNO -4, PLZPART +13, ...).
 */
export function musplusFromRow(row: number, rowsPerPattern = ROWS_PER_PATTERN): number {
  const half = rowsPerPattern / 2;
  return row < half ? row : row - rowsPerPattern;
}

/** Reproduce the DIS muscode_6 channels from the marker table and the live (order,row). */
export function reconstructSync(table: MarkerTable, order: number, row: number): SyncChannels {
  const p = absRowOf(table, order, row);
  // muscode = code of the latest marker at-or-before p (np_zinfo holds until the next Zxx).
  let muscode = 0;
  for (const m of table.markers) {
    if (m.absRow <= p) muscode = m.code;
    else break; // markers are sorted by absRow
  }
  return { muscode, musplus: musplusFromRow(row), musrow: row };
}
