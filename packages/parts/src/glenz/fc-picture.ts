// The FC backdrop picture (GLENZ/FC.UH), the background the additive glenz solids OR over.
//
// MAIN.C draws this picture, snapshots VRAM into `bgpic` (`memcpy(bgpic,vram,64000)`), then the glenz
// scanline filler ORs each solid's colour over that snapshot every frame (NEW.ASM ng_pass3 reads the
// background from `SEG _bgpic` via `or ah,fs:[di]`). So the background the web port composites the glenz
// fill over is exactly the decoded FC picture.
//
// `FC.UH` is the raw "Uh1" picture format (NOT the RLE `.U`/`fcfc` format `decodePicture` reads — see
// STATUS): a 16-byte header (`"Uh1\0"` magic + `wid`/`hig` as little-endian int16 + padding), then a
// 768-byte 6-bit VGA palette (256 entries), then `wid*hig` raw 8-bit indices, top row first. This is the
// byte layout `fc[]` is addressed with in MAIN.C: palette at `fc[a+16]`, pixels at `fc+768+16`.

import { SCREEN_H, SCREEN_W } from './glenz-fill.js';

/** Header size of the raw "Uh1" format (magic + dimensions + padding). */
const UH_HEADER = 16;
/** 256 VGA palette entries * 3 components. */
const UH_PALETTE = 256 * 3;

export interface FcPicture {
  /** Picture width in pixels (FC.UH: 320). */
  width: number;
  /** Picture height in pixels (FC.UH: 200). */
  height: number;
  /** `width * height` 8-bit palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** 768 raw 6-bit (0..63) VGA RGB triples, exactly as stored (the FC picture's own palette = `backpal`). */
  palette6: Uint8Array;
}

/** Read a little-endian unsigned 16-bit int at `off`. */
function readUint16LE(d: Uint8Array, off: number): number {
  return (d[off] ?? 0) | ((d[off + 1] ?? 0) << 8);
}

/**
 * Decode a raw "Uh1" picture (GLENZ/FC.UH). No compression: copy the 768-byte palette and the raw index
 * plane verbatim. The magic word is not validated (the original incbin's the bytes as `fc[]` without a
 * reader), matching how MAIN.C addresses the array directly.
 */
export function decodeFcPicture(buffer: ArrayBuffer | Uint8Array): FcPicture {
  const d = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const width = readUint16LE(d, 4);
  const height = readUint16LE(d, 6);
  const palette6 = d.slice(UH_HEADER, UH_HEADER + UH_PALETTE);
  const pixOff = UH_HEADER + UH_PALETTE;
  const indices = d.slice(pixOff, pixOff + width * height);
  return { width, height, indices, palette6 };
}

/**
 * The 16-entry background ramp MAIN.C copies out of the FC picture's palette (`backpal[a] = fc[a*3+0x10]`,
 * MAIN.C:540-547): the first 16 palette entries verbatim, as 6-bit VGA triples. This is what the copper
 * `pal[]` animates and what the glenz render palette (palette.ts) bases its low colours on.
 */
export function fcBackpal(pic: FcPicture): Uint8Array {
  return pic.palette6.slice(0, 16 * 3);
}

/**
 * The FC picture as a 320x200 8-bit index buffer, the background `bgpic` the glenz fill ORs over. If the
 * picture's own dimensions differ from the 320x200 field it is centred (FC.UH is exactly 320x200, so this
 * is a straight copy in practice; the guard keeps the function total for odd inputs and tests).
 */
export function fcBackground(pic: FcPicture): Uint8Array {
  const bg = new Uint8Array(SCREEN_W * SCREEN_H);
  const w = Math.min(SCREEN_W, pic.width);
  const h = Math.min(SCREEN_H, pic.height);
  const xOff = (SCREEN_W - w) >> 1;
  const yOff = (SCREEN_H - h) >> 1;
  for (let y = 0; y < h; y++) {
    const src = y * pic.width;
    const dst = (y + yOff) * SCREEN_W + xOff;
    for (let x = 0; x < w; x++) bg[dst + x] = pic.indices[src + x] ?? 0;
  }
  return bg;
}
