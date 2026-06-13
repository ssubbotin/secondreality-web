/** A raw Zxx marker: which order position it plays at, the row, and the info byte. */
export interface RawMarker {
  order: number;
  row: number;
  zinfo: number;
}

const S3M_CMD_Z = 26; // effect letter 'Z' (A=1 .. Z=26); STMIK's sync command.

/**
 * Parse every Zxx event out of an S3M's patterns, expanded across the order list
 * (a pattern reused in two orders yields two markers — they play at different times).
 * S3M patterns are always 64 rows; orders 254 (marker) and 255 (end) are skipped.
 */
export function parseS3MMarkers(buffer: ArrayBuffer): RawMarker[] {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const ordnum = dv.getUint16(0x20, true);
  const insnum = dv.getUint16(0x22, true);
  const patnum = dv.getUint16(0x24, true);

  const orderListOff = 0x60;
  const orders: number[] = [];
  for (let i = 0; i < ordnum; i++) orders.push(u8[orderListOff + i] ?? 255);

  const patPtrOff = orderListOff + ordnum + insnum * 2;
  const patParaPtr: number[] = [];
  for (let i = 0; i < patnum; i++) patParaPtr.push(dv.getUint16(patPtrOff + i * 2, true));

  // For each PATTERN, collect (row, zinfo) of every Zxx (cache so reused patterns parse once).
  const perPattern = new Map<number, Array<{ row: number; zinfo: number }>>();
  const parsePattern = (pat: number): Array<{ row: number; zinfo: number }> => {
    const cached = perPattern.get(pat);
    if (cached) return cached;
    const out: Array<{ row: number; zinfo: number }> = [];
    const para = patParaPtr[pat] ?? 0;
    if (para !== 0) {
      let p = (para << 4) + 2; // skip the 2-byte packed length
      let row = 0;
      while (row < 64 && p < u8.length) {
        const what = u8[p++] ?? 0;
        if (what === 0) {
          row++;
          continue;
        }
        if (what & 0x20) p += 2; // note + instrument
        if (what & 0x40) p += 1; // volume
        if (what & 0x80) {
          const command = u8[p++] ?? 0;
          const info = u8[p++] ?? 0;
          if (command === S3M_CMD_Z) out.push({ row, zinfo: info });
        }
      }
    }
    perPattern.set(pat, out);
    return out;
  };

  const markers: RawMarker[] = [];
  for (let order = 0; order < orders.length; order++) {
    const pat = orders[order] ?? 255;
    if (pat >= 254) continue; // 254 = +++ marker, 255 = end
    for (const ev of parsePattern(pat)) markers.push({ order, row: ev.row, zinfo: ev.zinfo });
  }
  markers.sort((a, b) => a.order - b.order || a.row - b.row);
  return markers;
}
