/**
 * The ALKU opening palette construction, ported from `ALKU/MAIN.C init()` (`MAIN.C:154-212`).
 *
 * The HOI horizon picture uses palette indices 0..63. `init()` copies the picture palette
 * (`memcpy(palette, hzpic+16, 768)`), then drawing the cards ORs a VGA plane byte `0x40 / 0x80 / 0xC0`
 * into those indices (ink levels 1/2/3, `MAIN.C:169-182`), so a lit text pixel reads palette index
 * `band | pictureColour`. `init()` builds the runtime palette so:
 *
 *  - indices 0x00..0x3F = the picture colours (`palette[y] = hzpic+16`);
 *  - band 0x40..0x7F    = picture colour blended toward ink colour `palette[1]` (`MAIN.C:192-197`);
 *  - band 0x80..0xBF    = blended toward ink colour `palette[2]` (`MAIN.C:198-203`);
 *  - band 0xC0..0xFF    = blended toward ink colour `palette[3]` (`MAIN.C:204-209`).
 *
 * This is the lit "picture + text" palette (`palette2`); the cards cross-fade black → it → black via
 * `dofade` (`MAIN.C:64`), reproduced by `lerpPalette`.
 *
 * Indices are 6-bit VGA (0..63); the GPU LUT multiplies by 4 to reach 8-bit.
 */

/** Glyph ink levels 1/2/3 map onto palette bands TEXT_BASE * level (0x40 / 0x80 / 0xC0). */
export const TEXT_BASE = 0x40;

const COLORS = 256;
const PAL_BYTES = COLORS * 3;
const BASE_COLORS = 64;

/**
 * `palette2`'s lit-band blend (`MAIN.C:194-196`): `out = (ink*63 + base*(63-ink)) >> 6`, integer
 * arithmetic, where `ink` is the band's text colour channel and `base` the picture colour channel of
 * `index % 64`.
 */
function blendBand(ink: number, base: number): number {
  return (ink * 63 + base * (63 - ink)) >> 6;
}

/**
 * Build the lit picture+text palette (`palette2`) from the 256×3 6-bit HOI source palette, porting
 * `MAIN.C:184-209`. Band 0 is the picture; bands 1/2/3 are the picture blended toward the three ink
 * colours (picture colours 1/2/3) so the glyph ink reads as a bright tint over the horizon.
 */
export function buildAlkuPalette(hoiPalette: Uint8Array): Uint8Array {
  const pal2 = new Uint8Array(PAL_BYTES);
  const base = new Uint8Array(BASE_COLORS * 3);
  for (let i = 0; i < BASE_COLORS * 3; i++) base[i] = hoiPalette[i] ?? 0;

  // The three ink colours are picture colours 1, 2, 3 (MAIN.C uses palette[0x1*3], [0x2*3], [0x3*3]).
  const inkColor = [
    [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0],
    [base[1 * 3 + 0] ?? 0, base[1 * 3 + 1] ?? 0, base[1 * 3 + 2] ?? 0],
    [base[2 * 3 + 0] ?? 0, base[2 * 3 + 1] ?? 0, base[2 * 3 + 2] ?? 0],
    [base[3 * 3 + 0] ?? 0, base[3 * 3 + 1] ?? 0, base[3 * 3 + 2] ?? 0],
  ] as const;

  for (let y = 0; y < PAL_BYTES; y += 3) {
    const band = Math.trunc(y / 3 / BASE_COLORS); // 0,1,2,3
    if (band === 0) {
      pal2[y + 0] = base[y + 0] ?? 0;
      pal2[y + 1] = base[y + 1] ?? 0;
      pal2[y + 2] = base[y + 2] ?? 0;
    } else {
      const ink = inkColor[band] ?? inkColor[0];
      const m = y % (BASE_COLORS * 3);
      pal2[y + 0] = blendBand(ink[0] ?? 0, base[m + 0] ?? 0);
      pal2[y + 1] = blendBand(ink[1] ?? 0, base[m + 1] ?? 0);
      pal2[y + 2] = blendBand(ink[2] ?? 0, base[m + 2] ?? 0);
    }
  }
  return pal2;
}

/**
 * One frame of `dofade` (`MAIN.C:306-310`): the 64-step linear cross-fade from `pal1` to `pal2` at step
 * `t` (0..64), `out[b] = (pal1[b]*(64-t) + pal2[b]*t) >> 6`. Integer arithmetic; `t` is clamped into
 * [0, 64]. At t=0 the output is `pal1`, at t=64 it is `pal2`. Returns a fresh palette (length = min input).
 */
export function lerpPalette(pal1: Uint8Array, pal2: Uint8Array, t: number): Uint8Array {
  const a = t < 0 ? 0 : t > 64 ? 64 : t;
  const n = Math.min(pal1.length, pal2.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = ((pal1[i] ?? 0) * (64 - a) + (pal2[i] ?? 0) * a) >> 6;
  }
  return out;
}
