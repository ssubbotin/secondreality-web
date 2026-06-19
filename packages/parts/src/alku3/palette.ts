/**
 * The ALKU title-reveal palette construction, ported from `ALKU/MAIN.C init()` (`MAIN.C:184-209`).
 *
 * The HOI horizon picture uses palette indices 0..63. The title card ORs a VGA plane byte
 * `0x40 / 0x80 / 0xC0` (ink levels 1/2/3) into those indices, so a lit title pixel reads palette index
 * `band | pictureColour`. `init()` builds the lit "picture + text" palette (`palette2`):
 *
 *  - indices 0x00..0x3F = the picture colours;
 *  - bands 0x40/0x80/0xC0 = the picture colour blended toward ink colours `palette[1]/[2]/[3]`.
 *
 * The reveal cross-fades black → `palette2` → black via `dofade` (`MAIN.C:64`), reproduced by
 * `lerpPalette`. Indices are 6-bit VGA (0..63); the GPU LUT multiplies by 4 to reach 8-bit.
 */

const COLORS = 256;
const PAL_BYTES = COLORS * 3;
const BASE_COLORS = 64;

/** `palette2`'s lit-band blend (`MAIN.C:194-196`): `out = (ink*63 + base*(63-ink)) >> 6`. */
function blendBand(ink: number, base: number): number {
  return (ink * 63 + base * (63 - ink)) >> 6;
}

/** Build the lit picture+text palette (`palette2`) from a 256×3 6-bit HOI palette (`MAIN.C:184-209`). */
export function buildAlkuPalette(hoiPalette: Uint8Array): Uint8Array {
  const pal2 = new Uint8Array(PAL_BYTES);
  const base = new Uint8Array(BASE_COLORS * 3);
  for (let i = 0; i < BASE_COLORS * 3; i++) base[i] = hoiPalette[i] ?? 0;

  const inkColor = [
    [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0],
    [base[1 * 3 + 0] ?? 0, base[1 * 3 + 1] ?? 0, base[1 * 3 + 2] ?? 0],
    [base[2 * 3 + 0] ?? 0, base[2 * 3 + 1] ?? 0, base[2 * 3 + 2] ?? 0],
    [base[3 * 3 + 0] ?? 0, base[3 * 3 + 1] ?? 0, base[3 * 3 + 2] ?? 0],
  ] as const;

  for (let y = 0; y < PAL_BYTES; y += 3) {
    const band = Math.trunc(y / 3 / BASE_COLORS);
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
 * `t` (0..64), `out[b] = (pal1[b]*(64-t) + pal2[b]*t) >> 6`. Integer arithmetic; `t` clamped into [0, 64].
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
