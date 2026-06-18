import { cos16, sin16 } from './mathsin.js';

// Verbatim port of GLENZ/MATH.ASM:calcmatrix — builds the rY*rX*rZ rotation matrix from the 16-bit
// sine/cosine tables. The asm computes each element as `imul` of two Q15 words then `shld dx,ax,1`,
// i.e. takes the high word of (product << 1) = the signed product shifted right by 15. Intermediate
// products are stored back as 16-bit words (sign-extended on reuse), so every step truncates to int16.
//
// Element layout (word offsets di+0..di+16 -> array index 0..8):
//   0 = Ycos*Zcos - Xsin*Ysin*Zsin     2 = Xsin*Ysin*Zcos + Ycos*Zsin   4 = -Xcos*Ysin
//   6 = -Xcos*Zsin                      8 = Xcos*Zcos                    10 = Xsin
//  12 = Xsin*Ycos*Zsin + Ysin*Zcos     14 = Ysin*Zsin - Xsin*Ycos*Zcos  16 = Xcos*Ycos

/** Sign-extend / truncate to signed 16-bit, as a MASM word store does. */
function s16(v: number): number {
  return (v << 16) >> 16;
}

/** `imul` two values then `shld dx,ax,1`: high word of (signed 32-bit product << 1) = (a*b) >> 15. */
function mul(a: number, b: number): number {
  // a,b are int16; product fits in 32 bits. >>15 then take low 16 bits (the `dx` word after shld).
  const prod = Math.trunc(a * b); // exact for |a*b| < 2^31
  return s16((prod >> 15) & 0xffff);
}

/**
 * calcMatrixYXZ(rx, ry, rz) -> Int16Array(9). Angles are 0.1-degree units (period 3600); they are
 * wrapped to [0,3600) by sin16/cos16 (the asm's checkdeg).
 */
export function calcMatrixYXZ(rx: number, ry: number, rz: number): Int16Array {
  const rxsin = sin16(rx);
  const rxcos = cos16(rx);
  const rysin = sin16(ry);
  const rycos = cos16(ry);
  const rzsin = sin16(rz);
  const rzcos = cos16(rz);

  const m = new Int16Array(9);

  // 14a: ax = rysin*rzsin -> m[14]; then 14b subtracts (m[14]*rxsin)
  let d14 = mul(rysin, rzsin);
  // 0a: m[0] = rycos*rzcos
  let d0 = mul(rycos, rzcos);
  // 14b: m[14] -= d0(==rycos*rzcos at this point) ... asm reuses dx from the prior `mov ds:[di+0],dx`
  //      mov ax,dx (the just-stored m[0]); imul rxsin; sub m[14]
  d14 = s16(d14 - mul(d0, rxsin));

  // cx = rxsin*rysin
  const cx = mul(rxsin, rysin);
  // 0b: ax = rzsin; imul dx(==cx); m[0] -= that
  d0 = s16(d0 - mul(rzsin, cx));

  // 2a: m[2] = rzcos*cx
  let d2 = mul(rzcos, cx);
  // 2b: m[2] += rycos*rzsin  (dx after this is rycos*rzsin, reused for 12a)
  const ryczs = mul(rycos, rzsin);
  d2 = s16(d2 + ryczs);

  // 12a: m[12] = rxsin*dx(==rycos*rzsin)
  let d12 = mul(rxsin, ryczs);
  // 12b: m[12] += rysin*rzcos
  d12 = s16(d12 + mul(rysin, rzcos));

  // 6: m[6] = -(rxcos*rzsin)
  const d6 = s16(-mul(rxcos, rzsin));
  // 8: m[8] = rxcos*rzcos
  const d8 = mul(rxcos, rzcos);
  // 4: m[4] = -(rxcos*rysin)
  const d4 = s16(-mul(rxcos, rysin));
  // 16: m[16] = rxcos*rycos
  const d16 = mul(rxcos, rycos);
  // 10: m[10] = rxsin
  const d10 = rxsin;

  m[0] = d0; // element 0
  m[1] = d2; // element 2
  m[2] = d4; // element 4
  m[3] = d6; // element 6
  m[4] = d8; // element 8
  m[5] = d10; // element 10
  m[6] = d12; // element 12
  m[7] = d14; // element 14
  m[8] = d16; // element 16
  return m;
}
