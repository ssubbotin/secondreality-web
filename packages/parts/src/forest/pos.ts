/**
 * Parser for the FOREST warp tables `POS1/2/3.DAT`, ported from the writer `READMASK.PAS` and the reader
 * `ROUTINES.ASM Putrouts`. Each `.DAT` holds exactly `FONT_W * FONT_H = 237 * 31 = 7347` entries, one per
 * font pixel, in row-major order (`READMASK.PAS`: `for y := 1 to 31` outer, `for c := 4 to 240` inner —
 * matching `font[(y-1)*237 + (c-4)]` and the reader's `inc bx`). Each entry is:
 *
 *   count : uint16le
 *   dests : count × uint16le      ; destination screen byte offsets, 0..63999
 *
 * `Putrouts` walks the entries in lockstep with the font index, stamping the font pixel value onto every
 * listed screen offset. The three files are three animation phases of the lake-reflection ripple.
 */

/** Visible font window width fed to the warp (READMASK `c := 4..240` → 237 columns). */
export const FONT_W = 237;
/** Visible font window height (READMASK `y := 1..31` → 31 rows). */
export const FONT_H = 31;
/** Total warp entries = one per font pixel. */
export const POS_ENTRIES = FONT_W * FONT_H; // 7347

/** Original VGA screen geometry the destination offsets index into. */
export const SCREEN_W = 320;
export const SCREEN_H = 200;
export const SCREEN_PIXELS = SCREEN_W * SCREEN_H; // 64000

/**
 * A parsed warp phase: a flat list of destination offsets plus `count[i]` / `start[i]` slices so the
 * compositor can iterate entry `i`'s destinations as `dests[start[i] .. start[i]+count[i])`. Storing it
 * flat (instead of an array of arrays) keeps the per-frame stamp loop allocation-free and cache-friendly.
 */
export interface PosTable {
  /** Per-entry destination count (length POS_ENTRIES). */
  readonly count: Uint16Array;
  /** Per-entry start index into `dests` (length POS_ENTRIES). */
  readonly start: Uint32Array;
  /** All destination screen offsets, concatenated in entry order. */
  readonly dests: Uint16Array;
  /** Total destination count (= dests.length). */
  readonly total: number;
}

/** Read an unsigned little-endian 16-bit int at byte offset `off`. */
function readUint16LE(d: Uint8Array, off: number): number {
  return (d[off] ?? 0) | ((d[off + 1] ?? 0) << 8);
}

/**
 * Parse a `POS*.DAT` buffer into a {@link PosTable}. Reads exactly {@link POS_ENTRIES} entries; throws if
 * the file is shorter than the declared entries require (a guard the original — which trusted its own
 * generator — lacked). The byte cursor must land exactly on the file end for the vendored data.
 */
export function parsePos(buffer: ArrayBuffer | Uint8Array): PosTable {
  const d = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const count = new Uint16Array(POS_ENTRIES);
  const start = new Uint32Array(POS_ENTRIES);

  // First pass: read counts and total to size the flat dest array exactly.
  let cursor = 0;
  let total = 0;
  for (let i = 0; i < POS_ENTRIES; i++) {
    if (cursor + 2 > d.length) {
      throw new Error(`parsePos: truncated at entry ${i} (offset ${cursor}/${d.length})`);
    }
    const c = readUint16LE(d, cursor);
    cursor += 2;
    count[i] = c;
    start[i] = total;
    total += c;
    cursor += c * 2; // skip this entry's dest words
  }

  // Second pass: copy the dests into the flat array.
  const dests = new Uint16Array(total);
  cursor = 0;
  let di = 0;
  for (let i = 0; i < POS_ENTRIES; i++) {
    const c = count[i] ?? 0;
    cursor += 2;
    for (let j = 0; j < c; j++) {
      dests[di] = readUint16LE(d, cursor);
      di++;
      cursor += 2;
    }
  }

  return { count, start, dests, total };
}
