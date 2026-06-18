import { COLS, columnRay, type FieldState } from './field-sim.js';
import { WAVE_FIELD_WORDS } from './tables.js';

/** The rendered field is 160 logical columns (the original doubles to 320 via the mode-X copy). */
export const FIELD_W = COLS; // 160
export const FIELD_H = 200;

/** THELOOP.INC depth-walk parameters (DOLOOP.C: bail=192, bailhalve=64, horizony=70). */
const BAIL = 192;
const BAIL_HALVE = 64;
const HORIZON_Y = 70;
const COLOR_BASE = 140; // shipped THELOOP.INC colour base (NOT DOLOOP.C's checked-in 120)

/** Mask off a 16-bit value's low bit (the original `and si,not 1` word alignment). */
const even = (v: number): number => v & 0xfffe;
const u16 = (v: number): number => v & 0xffff;
const s16 = (v: number): number => {
  const w = v & 0xffff;
  return w >= 0x8000 ? w - 0x10000 : w;
};

/** wflip — swap the two 16-bit halves (the original's fixed-point pre-swap so the magnitude lands
 *  in the fractional low word of the 32-bit accumulator). */
const wflip = (l: number): number => {
  const v = l >>> 0;
  const lo = v & 0xffff;
  const hi = (v >>> 16) & 0xffff;
  return ((lo << 16) | hi) >>> 0;
};

const FIRST_RAY_DIR = wflip((-((200 - HORIZON_Y) * 2560) >>> 0) >>> 0); // = 0xEC00FFFA (−332800)
const L_2560 = wflip(2560);
const L_3X = wflip(3 * 2560);

/**
 * Build the zwave-baked per-depth height offset table: off[j] = zwave[j] − 240 (DOLOOP.C, verified
 * against THELOOP.INC). Passed in so the raster can stay pure; `zwave` comes from tables.buildZwave.
 */
export function buildHeightOffset(zwave: Int16Array): Int16Array {
  const t = new Int16Array(BAIL);
  for (let j = 0; j < BAIL; j++) t[j] = (zwave[j] ?? 0) - 240;
  return t;
}

// 32-bit add returning [sum, carryFlag] — models `add eax,src` / the CF the original `adc` consumes.
function add32(a: number, b: number): [number, number] {
  const s = (a >>> 0) + (b >>> 0);
  return [s >>> 0, s > 0xffffffff ? 1 : 0];
}
// `adc ax,imm` — add into the low 16 bits only (with carry-in); the high word is untouched.
function adcLow16(eax: number, imm: number, cf: number): number {
  const low = (eax & 0xffff) + (imm & 0xffff) + cf;
  return (((eax & 0xffff0000) >>> 0) | (low & 0xffff)) >>> 0;
}

/**
 * One screen column of the forward voxel raster (THELOOP.INC, instruction-faithful). Walks 192 depth
 * steps front-to-back; the ray descends by the (negative) slope `ecx`; where the terrain rises above
 * the ray the column fills upward (1–3 screen rows per hit, advancing the ray by j·2560 per row) and
 * the slope steepens. `sina` switches 1→2 at depth 64 (the LOD: the far half marches twice as fast).
 *
 * @param out     destination column, index 0 = top row .. 199 = bottom row (caller maps to the field)
 * @param si,di   wave-X / wave-Y position (byte offsets; even-masked, word-indexed into the fields)
 * @param xs1,ys1 wave-X / wave-Y step per depth (even-masked)
 * @param heightX,heightY  the W1DTA/W2DTA heightfields (32768 signed words each)
 * @param off     buildHeightOffset(zwave)
 */
export function rasterColumn(
  out: Uint8Array,
  si: number,
  di: number,
  xs1: number,
  ys1: number,
  heightX: Int16Array,
  heightY: Int16Array,
  off: Int16Array,
): void {
  const xs2 = u16(xs1 * 2);
  const ys2 = u16(ys1 * 2);
  let s = u16(si);
  let d = u16(di);
  let eax = 0;
  let ecx = FIRST_RAY_DIR;
  let row = 199; // bottom of the column; the original `sub bp,160` moves up one row
  let sina = 1;
  let j = 0;
  while (j < BAIL) {
    if (j === BAIL_HALVE) sina = 2;
    const xstep = sina === 2 ? xs2 : xs1;
    const ystep = sina === 2 ? ys2 : ys1;
    s = u16(s + xstep);
    let bx = heightX[(s >> 1) & (WAVE_FIELD_WORDS - 1)] ?? 0;
    d = u16(d + ystep);
    bx += heightY[(d >> 1) & (WAVE_FIELD_WORDS - 1)] ?? 0;
    bx = s16(bx + (off[j] ?? 0));
    let ax = s16(eax & 0xffff);
    if (ax >= bx) {
      let cf: number;
      [eax, cf] = add32(eax, ecx);
      if (sina === 2) [eax, cf] = add32(eax, ecx);
      eax = adcLow16(eax, 0xffff, cf); // adc ax,-1
      j += sina === 2 ? 2 : 1;
      continue;
    }
    // HIT — shade by terrain height; /2 maps into the palette ramp.
    const dl = ((u16(bx + (COLOR_BASE - (j >> 3))) >> 1) & 0xff) >>> 0;
    const l = wflip((j * 2560) >>> 0);
    let cf: number;
    for (;;) {
      [eax, cf] = add32(eax, l);
      eax = adcLow16(eax, 0, cf);
      if (row >= 0 && row <= 199) out[row * FIELD_W] = dl;
      ax = s16(eax & 0xffff);
      if (ax >= bx) {
        let cf2: number;
        [ecx, cf2] = add32(ecx, L_2560);
        ecx = adcLow16(ecx, 0, cf2);
        row -= 1;
        break;
      }
      [eax, cf] = add32(eax, l);
      eax = adcLow16(eax, 0, cf);
      if (row - 1 >= 0 && row - 1 <= 199) out[(row - 1) * FIELD_W] = dl;
      ax = s16(eax & 0xffff);
      if (ax >= bx) {
        let cf2: number;
        [ecx] = add32(ecx, L_2560);
        [ecx, cf2] = add32(ecx, L_2560);
        ecx = adcLow16(ecx, 0, cf2);
        row -= 2;
        break;
      }
      [eax, cf] = add32(eax, l);
      eax = adcLow16(eax, 0, cf);
      if (row - 2 >= 0 && row - 2 <= 199) out[(row - 2) * FIELD_W] = dl;
      let cf3: number;
      [ecx, cf3] = add32(ecx, L_3X);
      ecx = adcLow16(ecx, 0, cf3);
      row -= 3;
      ax = s16(eax & 0xffff);
      if (ax >= bx) break;
    }
    let cf4: number;
    [eax, cf4] = add32(eax, ecx);
    if (sina === 2) [eax, cf4] = add32(eax, ecx);
    eax = adcLow16(eax, 0xffff, cf4);
    j += sina === 2 ? 2 : 1;
  }
}

/**
 * Rasterise one frame into a FIELD_W×FIELD_H (160×200) 8-bit palette-index buffer. Clears the sky to
 * palette 0 first, then casts one ray per screen column (MAIN.C doit() inner loop): each column's wave
 * position is the camera position (xwav/ywav) and its ray step is columnRay(a). Image x = column a
 * (the de-planarised screen order the mode-X `docopy` reconstructs from the (a&1)·80+(a>>1) vbuf
 * layout). The ray-height accumulator starts at 0 (the shipped theloop xor-zeroes eax, so the
 * `cameralevel` arg the entry stub stored is unused) — `CAMERA_LEVEL` lives in field-sim for parity.
 */
export function rasterField(
  out: Uint8Array,
  s: FieldState,
  heightX: Int16Array,
  heightY: Int16Array,
  off: Int16Array,
): void {
  out.fill(0);
  const xw = even(s.xwav);
  const yw = even(s.ywav);
  for (let a = 0; a < FIELD_W; a++) {
    const { xa, ya } = columnRay(a, s);
    rasterColumn(
      out.subarray(a), // column a occupies stride-FIELD_W cells starting at offset a
      xw,
      yw,
      even(xa),
      even(ya),
      heightX,
      heightY,
      off,
    );
  }
}
