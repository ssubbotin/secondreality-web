// Runtime types for the STMIK Zxx marker table emitted by scripts/extract-markers.mjs.
// The reconstruction (Plan 03 Task 2) turns these markers + the live (order,row) from the
// AudioClock into the four-channel music sync (muscode/musplus/musrow/mframe).

/** One STMIK Zxx sync marker, placed on the absolute play-row timeline. */
export interface SyncMarker {
  /** Absolute play row = orderStartRow[order] + row. The reconstruction's lookup key. */
  absRow: number;
  /** Order-list index it occurs in (matches libopenmpt's get_current_order at runtime). */
  order: number;
  /** Row within the pattern (0..rows-1). */
  row: number;
  /** Channel carrying the Zxx. */
  ch: number;
  /** The Zxx parameter byte — np_zinfo, the sync code parts compare against. */
  code: number;
}

/** The full marker table for one module (the JSON shape extract-markers.mjs writes). */
export interface MarkerTable {
  module: string;
  channels: number;
  /** Total play rows across all orders (orderStartRow[last] + last pattern rows). */
  totalRows: number;
  /** orderStartRow[order] = cumulative play rows before that order. */
  orderStartRow: number[];
  /** Every Zxx marker, sorted by absRow. */
  markers: SyncMarker[];
}

/**
 * Absolute play-row of an (order,row), computed the SAME way the extractor placed markers,
 * so the live play head and the markers share one coordinate space.
 */
export function absRowOf(table: MarkerTable, order: number, row: number): number {
  return (table.orderStartRow[order] ?? 0) + row;
}
