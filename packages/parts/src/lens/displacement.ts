// Lens displacement tables, ported from the original LENS effect.
//
// CALC.C renders four "column" passes over the 152×116 lens stencil and writes each as a row-indexed
// table LENS.EX{1..4} (all int16 LE / putw):
//   header: LENS_YMAX pairs of (rowbeg, rowcnt)
//             rowbeg = byte offset of this row's data = rd_word_index*2 + LENS_YMAX*4
//             rowcnt = record count (col1/col4 → words; col2/col3 → (dest,src) pairs)
//   data:   the rd[] stream (signed int16 words)
// ASM.ASM's dorow/dorow2/dorow3 consume these per screen row; buildLensPlan flattens them into ordered
// plot-ops (relative source/destination offsets + a palette-band flag) so the warp can replay them at any
// lens position by adding the lens base offset u = (x0-lensxs) + (y0-lensys)*320.

/** Lens stencil height in rows (CALC.C: ymax = 120). */
export const LENS_YMAX = 120;

/** Lens dimensions written to LENS.EX0 (2*cx, by). cx=76, the captured by (max lit row) = 116. */
export const LENS_WID = 152;
export const LENS_HIG = 116;
export const LENS_XS = LENS_WID >> 1; // 76 — lensxs in MAIN.C
export const LENS_YS = LENS_HIG >> 1; // 58 — lensys in MAIN.C

/** Mode-X screen width: every screen offset is `x + y*320`. */
export const SCREEN_W = 320;

const HEADER_BYTES = LENS_YMAX * 4; // ymax × (rowbeg,rowcnt) int16 pairs

/** A parsed LENS.EX{n} table. `wordAt(row, i)` reads the i-th rd[] word of that row. */
export interface ExTable {
  readonly rowBeg: Int32Array; // file byte offset of each row's data
  readonly rowCnt: Int32Array; // record count per row
  /** Read the i-th signed int16 word of the row's data stream. */
  wordAt(row: number, i: number): number;
}

function readI16(buf: Uint8Array, byteOffset: number): number {
  const lo = buf[byteOffset] ?? 0;
  const hi = buf[byteOffset + 1] ?? 0;
  const v = lo | (hi << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/** Decode a LENS.EX{n} table byte-exact. */
export function parseExTable(buf: Uint8Array): ExTable {
  const rowBeg = new Int32Array(LENS_YMAX);
  const rowCnt = new Int32Array(LENS_YMAX);
  for (let y = 0; y < LENS_YMAX; y++) {
    rowBeg[y] = readI16(buf, y * 4);
    rowCnt[y] = readI16(buf, y * 4 + 2);
  }
  return {
    rowBeg,
    rowCnt,
    wordAt(row: number, i: number): number {
      const base = rowBeg[row] ?? HEADER_BYTES;
      return readI16(buf, base + i * 2);
    },
  };
}

/** Which CALC.C/ASM.ASM pass produced an op (selects the palette band flag). */
export type PlotPass = 'col1' | 'col2' | 'col3' | 'col4';

/**
 * One plot operation, with offsets relative to the lens base u:
 *   screen[u + dst] = back[u + src] | flag
 * (col4 copies the background straight through, so src === dst and flag === 0.)
 */
export interface PlotOp {
  readonly pass: PlotPass;
  readonly src: number;
  readonly dst: number;
  readonly flag: number;
}

export interface PlanRow {
  readonly ops: PlotOp[];
}

export interface LensPlan {
  /** One entry per lens row (LENS_YMAX); rows untouched by every pass have an empty op list. */
  readonly rows: PlanRow[];
  readonly lensHig: number;
}

/** dorow (ASM.ASM col1): di = u + rd[0]; bp walks consecutively from di. Skipped when cnt < 4. */
function emitCol1(ops: PlotOp[], t: ExTable, y: number, flag: number): void {
  const cnt = t.rowCnt[y] ?? 0;
  if (cnt < 4) return; // ASM.ASM: cmp cx,4 / jge @@2 — runs of < 4 are dropped
  const start = t.wordAt(y, 0);
  for (let k = 0; k < cnt; k++) {
    ops.push({ pass: 'col1', src: start + t.wordAt(y, 1 + k), dst: start + k, flag });
  }
}

/** dorow2 (ASM.ASM col2/col3): base = u + rd[0]; per pair the words are (dest, src). */
function emitPair(ops: PlotOp[], t: ExTable, y: number, pass: PlotPass, flag: number): void {
  const cnt = t.rowCnt[y] ?? 0;
  if (cnt === 0) return;
  const base = t.wordAt(y, 0);
  for (let k = 0; k < cnt; k++) {
    const dest = t.wordAt(y, 1 + k * 2);
    const src = t.wordAt(y, 2 + k * 2);
    ops.push({ pass, src: base + src, dst: base + dest, flag });
  }
}

/** dorow3 (ASM.ASM col4): di = u + rd[0] (=u, rd[0]==0); per word off = di + rd[k]; copies back→screen. */
function emitCol4(ops: PlotOp[], t: ExTable, y: number): void {
  const cnt = t.rowCnt[y] ?? 0;
  if (cnt === 0) return;
  const base = t.wordAt(y, 0); // always 0 in CALC.C
  for (let k = 0; k < cnt; k++) {
    const off = base + t.wordAt(y, 1 + k);
    ops.push({ pass: 'col4', src: off, dst: off, flag: 0 });
  }
}

/**
 * Flatten the four passes into per-row plot-ops in the exact order drawlens issues them
 * (col1 → col2 → col3 → col4, MAIN.C:61-72). The band flags reproduce the palette-band select:
 * col1 0x40, col2 0x80, col3 0xC0, col4 0.
 */
export function buildLensPlan(ex1: ExTable, ex2: ExTable, ex3: ExTable, ex4: ExTable): LensPlan {
  const rows: PlanRow[] = [];
  for (let y = 0; y < LENS_YMAX; y++) {
    const ops: PlotOp[] = [];
    emitCol1(ops, ex1, y, 0x40);
    emitPair(ops, ex2, y, 'col2', 0x80);
    emitPair(ops, ex3, y, 'col3', 0xc0);
    emitCol4(ops, ex4, y);
    rows.push({ ops });
  }
  return { rows, lensHig: LENS_HIG };
}
