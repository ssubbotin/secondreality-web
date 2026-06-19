/**
 * Material table parser, ported from the VISU toolchain's READMAT.C. A `.MAT` line is
 *   `NAME <base-color> L<len> [G] [X]`
 * where base-color is the first palette index of the material's shade ramp, L# the ramp length
 * (32/16/8, or 1 = unshaded), G = gouraud, X = two-sided. The flat-shaded face colour is
 * `base + calcLight(normal, shadeBits)` where shadeBits is 3/4/5 for ramp length 32/16/8 (ADRAW.ASM).
 */

export interface MaterialDef {
  name: string;
  /** First palette index of the shade ramp. */
  color: number;
  /** Ramp length: 32, 16, 8, or 1 (unshaded). */
  colorlen: number;
  /** ADRAW `calclight` shift: 3 (len 32), 4 (len 16), 5 (len 8), or 0 (unshaded → flat colour). */
  shadeBits: number;
  gouraud: boolean;
  twoSided: boolean;
}

/** Map a ramp length to the ADRAW.ASM `calclight` shift (`shr ax,cl`, cl = 6 - log... see ADRAW). */
export function shadeBitsForLen(len: number): number {
  switch (len) {
    case 32:
      return 3; // F_SHADE32 → shift 3
    case 16:
      return 4; // F_SHADE16 → shift 4
    case 8:
      return 5; // F_SHADE8  → shift 5
    default:
      return 0; // L1 / unshaded → flat base colour
  }
}

export function parseMaterials(text: string): Map<string, MaterialDef> {
  const out = new Map<string, MaterialDef>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    // READMAT.C tokenises on whitespace; '#' in a name is replaced by a space, but the name token is the
    // first token, so e.g. `BLUE#PLASTIC` becomes name `BLUE` with `PLASTIC` ignored as a stray token.
    const tokens = line.split(/\s+/);
    const rawName = tokens[0] ?? '';
    const name = rawName.split('#')[0] ?? rawName;
    let color = 0;
    let colorlen = 1;
    let gouraud = false;
    let twoSided = false;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i] ?? '';
      const c = t[0]?.toUpperCase() ?? '';
      if (c === 'X') twoSided = true;
      else if (c === 'L') colorlen = Number.parseInt(t.slice(1), 10) || 1;
      else if (c === 'G') gouraud = true;
      else if (c >= '0' && c <= '9') color = Number.parseInt(t, 10) || 0;
    }
    out.set(name, {
      name,
      color,
      colorlen,
      shadeBits: shadeBitsForLen(colorlen),
      gouraud,
      twoSided,
    });
  }
  return out;
}
