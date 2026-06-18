/**
 * Parses DOTS/FACE.INC — the `_face` vertex table for the original 3D object.
 *
 * FACE.C reads a 3D-Studio `.asc` export and prints one `dw x,y,z` line per vertex, scaled ×1000 and
 * truncated to `int`, with the Y/Z axes swapped and Z negated:
 *   printf("dw %i,%i,%i\n", (int)(x*1000), -(int)(z*1000), (int)(y*1000));
 * ASM.ASM includes FACE.INC after the `_face LABEL WORD` and appends `dw 30000,30000,30000` as the
 * end-of-list sentinel. The shipped FACE.INC carries only a single vertex (the rest of the object's
 * data was not distributed with the source); `_drawdots` never reads `_face`, so the object is not part
 * of the visible effect — the drawn balls are positioned procedurally by MAIN.C. We parse and assert it
 * byte-exact regardless, as the vendored data oracle.
 */

/** The `dw 30000,30000,30000` sentinel ASM.ASM appends after the FACE.INC include. */
export const FACE_TERMINATOR: readonly [number, number, number] = [30000, 30000, 30000];

/**
 * Parse `dw a,b,c` lines (each a vertex `[x, y, z]`) into a flat Int16Array of triples, then append the
 * ASM.ASM terminator. Tolerant of CRLF and of non-`dw` assembler lines (labels, blanks, comments).
 */
export function parseFaceInc(text: string): Int16Array {
  const out: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^dw\s+(.+)$/i);
    if (!m) continue;
    for (const tok of (m[1] ?? '').split(',')) {
      const n = Number.parseInt(tok.trim(), 10);
      if (Number.isNaN(n)) continue;
      out.push(n);
    }
  }
  out.push(FACE_TERMINATOR[0], FACE_TERMINATOR[1], FACE_TERMINATOR[2]);
  return Int16Array.from(out);
}
