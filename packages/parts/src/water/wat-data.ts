/**
 * WAT{1,2,3}.DAT — the per-frame water-ripple displacement stream consumed by `Putrouts1`
 * (`WATER/ROUTINES.ASM`).
 *
 * The original blit walks the 158×34 scroll buffer cell by cell (`dx = 158*34` iterations, `bx` the
 * font/scroll-buffer index). For each cell it reads a little-endian record from the `.DAT`:
 *
 *   lodsw            ; count = number of destination screen offsets for this cell
 *   or ax,ax / je    ; count == 0 → emit nothing, advance to the next cell
 *   cx = count
 *   @b: lodsw        ; di = destination screen offset (0..63999)
 *       ...plot...
 *       loop @b
 *
 * So a frame is exactly `158*34 = 5372` records, each `uint16 count` then `count` `uint16` offsets. The
 * baked tables (built by `DATGEN.PAS` from the POV ripple frames) encode which screen pixels the
 * reflected/rippled water touches for each scroll-buffer cell — the animation lives entirely in the
 * differing position sets of WAT1/WAT2/WAT3.
 */

export const FBUF_WIDTH = 158;
export const FBUF_HEIGHT = 34;
/** One record per scroll-buffer cell. */
export const FRAME_RECORDS = FBUF_WIDTH * FBUF_HEIGHT; // 5372
export const SCREEN_W = 320;
export const SCREEN_H = 200;
export const SCREEN_PIXELS = SCREEN_W * SCREEN_H; // 64000

export interface WatRecord {
  readonly count: number;
  /** `count` destination screen offsets in [0, 64000). */
  readonly pos: Uint16Array;
}

export interface WatFrame {
  readonly records: WatRecord[];
  /** Total destination positions across all records (for tests / sanity). */
  readonly totalPos: number;
}

/**
 * Parse one WAT*.DAT frame. Reads exactly `FRAME_RECORDS` records as little-endian uint16, matching the
 * DOS `lodsw` walk. Extra trailing bytes (WAT4.DAT has some; unused by the demo) are ignored.
 */
export function parseWatFrame(buf: ArrayBuffer | Uint8Array): WatFrame {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: WatRecord[] = new Array(FRAME_RECORDS);
  let off = 0;
  let totalPos = 0;
  for (let r = 0; r < FRAME_RECORDS; r++) {
    if (off + 2 > bytes.length) {
      throw new Error(`WAT frame truncated at record ${r} (offset ${off})`);
    }
    const count = view.getUint16(off, true);
    off += 2;
    const pos = new Uint16Array(count);
    for (let i = 0; i < count; i++) {
      if (off + 2 > bytes.length) {
        throw new Error(`WAT frame truncated mid-record ${r} (offset ${off})`);
      }
      pos[i] = view.getUint16(off, true);
      off += 2;
    }
    records[r] = { count, pos };
    totalPos += count;
  }
  return { records, totalPos };
}
