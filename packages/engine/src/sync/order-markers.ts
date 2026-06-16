// Per-order np_zplus reconstruction from the S3M order list's +++ markers.
//
// STMIK sets np_zplus (0..3) per order; the DIS service muscode_6 then uses it as a phase selector to
// compute dis_musplus() from the row (see sync/reconstruct.ts and DIS/DISINT.ASM:242-282). The value
// is just "which side is a +++ (0xFE) marker on": a marker immediately ahead means a hit is coming
// (musplus counts down to it), immediately behind means a hit just passed (musplus counts up from it).
//
// libopenmpt preserves +++ (0xFE -> reported pattern 65534) and --- (0xFF -> 65535) order entries in
// place — it only trims trailing terminators — so the live order index indexes this table directly.

const PLUS = 0xfe; // '+++' order-list marker (STMIK sync point)
const STOP = 0xff; // '---' order-list terminator / stop slot

/** Read a little-endian u16 at byte offset `o`. */
function u16(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}

/**
 * Per-order np_zplus (0..3) derived from the S3M order list's +++ markers. Index it by the live order
 * libopenmpt reports. Reads only the order count (offset 0x20) and the order list (0x60).
 *
 *   zplus[k] = (orderList[k-1] is +++ ? 2 : 0) + (orderList[k+1] is +++ ? 1 : 0)
 *
 * Marker (0xFE) and stop (0xFF) slots are never a live order, so they get 0.
 */
export function computeZplusTable(bytes: Uint8Array): Int8Array {
  const ordnum = u16(bytes, 0x20);
  const orders = bytes.subarray(0x60, 0x60 + ordnum);
  const table = new Int8Array(ordnum);
  for (let k = 0; k < ordnum; k++) {
    const here = orders[k];
    if (here === PLUS || here === STOP) continue; // marker/stop slot, never a live order
    let z = 0;
    if (k > 0 && orders[k - 1] === PLUS) z += 2; // +++ immediately behind
    if (k < ordnum - 1 && orders[k + 1] === PLUS) z += 1; // +++ immediately ahead
    table[k] = z;
  }
  return table;
}
