// 16-bit fixed-point sine/cosine tables, verbatim regeneration of GLENZ/MATHSIN.INC. The period is
// 3600 "degrees" (0.1 real degrees per step); amplitude 32767. MATH.ASM (calcmatrix) reads
// sintable16[deg]/costable16[deg] after checkdeg clamps deg into [0,3600).
//
// The original tables were built from a single rounded sine *quarter* and reflected into the other
// quadrants — NOT recomputed per index with a direct cos() call. We reproduce that exactly:
//
//   Q[d] = round-half-up(32767 * sin(d * pi / 1800))   for d in [0, 900]   (the rising quarter)
//
// then the full-period sine S(d) is Q reflected by quadrant, with the negative quadrants carrying the
// one-bit negation bias the original assembler emitted (a magnitude reflected through `-(q)+1`, i.e.
// pulled one step toward zero — visible as the trough being -32766, not -32767). cos16(d) = S(d + 900).
//
// `Q` reproduces sintable16 byte-for-byte; `S(d+900)` reproduces costable16 byte-for-byte except a single
// 16383.5 tie at 240 degrees that the assembler rounded the opposite way from its 120-degree twin — a
// build-order float artifact, patched explicitly below (see mathsin.test.ts, which asserts the whole
// 3600-word table against the vendored MATHSIN.INC).

export const DEG = 3600;
const QUARTER = 900;

const roundHalfUp = (v: number): number => Math.floor(v + 0.5);

// Rising quarter Q[0..900]; Q[0]=0, Q[900]=32767.
const Q = new Int32Array(QUARTER + 1);
for (let d = 0; d <= QUARTER; d++) Q[d] = roundHalfUp(32767 * Math.sin((d * Math.PI) / 1800));

// Negative-quadrant reflection: magnitude pulled one step toward zero (0 stays 0).
const negBias = (q: number): number => (q === 0 ? 0 : -q + 1);

function buildSin(): Int16Array {
  const t = new Int16Array(DEG);
  for (let d = 0; d < DEG; d++) {
    if (d <= QUARTER) t[d] = Q[d] ?? 0;
    else if (d <= 1800) t[d] = Q[1800 - d] ?? 0;
    else if (d <= 2700) t[d] = negBias(Q[d - 1800] ?? 0);
    else t[d] = negBias(Q[3600 - d] ?? 0);
  }
  return t;
}

const SIN = buildSin();

const wrap = (d: number): number => ((d % DEG) + DEG) % DEG;

/** sin16(d), d in 0.1-degree units; wraps to [0,3600). */
export function sin16(d: number): number {
  return SIN[wrap(d)] ?? 0;
}

// cos16(d) = sin16(d + 900). One 16383.5 tie (240 degrees) rounded opposite to its 120-degree twin in the
// shipped table; correct that single entry so cos16 matches MATHSIN.INC byte-for-byte.
const COS = new Int16Array(DEG);
for (let d = 0; d < DEG; d++) COS[d] = sin16(d + QUARTER);
COS[2400] = -16383;

/** cos16(d), d in 0.1-degree units; wraps to [0,3600). */
export function cos16(d: number): number {
  return COS[wrap(d)] ?? 0;
}
