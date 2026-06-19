/**
 * The ALKU opening palette construction, ported verbatim from `MAIN.C init()` (`MAIN.C:184-212`).
 *
 * The HOI picture only uses palette indices 0..63 (verified: the shipped `HOI.U` pixels span 0..52). The
 * text scroller ORs a plane byte `0x40 / 0x80 / 0xC0` into those indices (ink levels 1/2/3), so a lit text
 * pixel reads palette index `band | baseColor`. `init()` builds the runtime palette so:
 *
 *  - indices 0..63   = the picture colours (`palette[y] = hzpic+16`, i.e. the HOI 6-bit VGA palette);
 *  - band 0x40..0x7F = picture colour blended toward ink colour `palette[1]` (`palette2`, MAIN.C:192-197);
 *  - band 0x80..0xBF = blended toward ink colour `palette[2]` (MAIN.C:198-203);
 *  - band 0xC0..0xFF = blended toward ink colour `palette[3]` (MAIN.C:204-209);
 *  - then `for(a=192;a<768;a++) palette[a]=palette[a-192]` replicates the *unlit* picture into every band
 *    in the plain `palette` (the no-text picture palette).
 *
 * `palette2` is the picture+text palette uploaded while the credits are visible; we use it directly.
 */

const COLORS = 256;
const PAL_BYTES = COLORS * 3;
const BASE_COLORS = 64;

/**
 * `palette2`'s lit-band blend (`MAIN.C:194-196`): `out = (ink*63 + base*(63-ink)) >> 6`, integer arithmetic,
 * where `ink` is the band's text colour channel and `base` the picture colour channel of `index % 64`.
 */
function blendBand(ink: number, base: number): number {
  return (ink * 63 + base * (63 - ink)) >> 6;
}

/**
 * Build the picture+text palette (`palette2`) from a 256×3 6-bit HOI source palette, porting
 * `MAIN.C:184-209`. Returns a fresh 768-byte 6-bit VGA palette: band 0 is the picture, bands 1/2/3 are the
 * picture blended toward the three ink colours (picture colours 1/2/3) so the credits read as a bright tint.
 */
export function buildAlku2Palette(hoiPalette: Uint8Array): Uint8Array {
  const pal2 = new Uint8Array(PAL_BYTES);
  // The picture colours occupy indices 0..63; copy them in (the rest of the source is overwritten below).
  const base = new Uint8Array(BASE_COLORS * 3);
  for (let i = 0; i < BASE_COLORS * 3; i++) base[i] = hoiPalette[i] ?? 0;

  // The three ink colours are picture colours 1, 2, 3 (MAIN.C uses palette[0x1*3], [0x2*3], [0x3*3]).
  const inkColor = [
    [base[0], base[1], base[2]], // band 0 (unused as ink) — kept as the picture base
    [base[1 * 3 + 0], base[1 * 3 + 1], base[1 * 3 + 2]],
    [base[2 * 3 + 0], base[2 * 3 + 1], base[2 * 3 + 2]],
    [base[3 * 3 + 0], base[3 * 3 + 1], base[3 * 3 + 2]],
  ] as const;

  for (let y = 0; y < PAL_BYTES; y += 3) {
    const band = Math.trunc(y / 3 / BASE_COLORS); // 0,1,2,3
    if (band === 0) {
      // Picture band: verbatim picture colours.
      pal2[y + 0] = base[y + 0] ?? 0;
      pal2[y + 1] = base[y + 1] ?? 0;
      pal2[y + 2] = base[y + 2] ?? 0;
    } else {
      const ink = inkColor[band] ?? inkColor[0];
      const m = y % (BASE_COLORS * 3); // index into the picture base colour
      pal2[y + 0] = blendBand(ink[0] ?? 0, base[m + 0] ?? 0);
      pal2[y + 1] = blendBand(ink[1] ?? 0, base[m + 1] ?? 0);
      pal2[y + 2] = blendBand(ink[2] ?? 0, base[m + 2] ?? 0);
    }
  }
  return pal2;
}
