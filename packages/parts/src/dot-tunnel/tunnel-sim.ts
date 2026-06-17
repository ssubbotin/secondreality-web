/** TUN10.PAS frame count to exit / start the end-fade (at VEKE−102). */
export const VEKE = 1060;

/**
 * The `putki` ring-buffer state. cx/cy/cc[99] is the freshest ring; lower indices are older camera
 * positions, so the chain of centres traces the delayed camera path — the curving tube. Length 103
 * matches the original `array[0..102]`.
 */
export interface TunnelState {
  readonly cx: Int32Array;
  readonly cy: Int32Array;
  readonly cc: Uint8Array;
  sx: number;
  sy: number;
  frame: number;
}

export function createTunnelState(): TunnelState {
  return {
    cx: new Int32Array(103),
    cy: new Int32Array(103),
    cc: new Uint8Array(103),
    sx: 0,
    sy: 0,
    frame: 0,
  };
}

/**
 * One simulation tick (TUN10.PAS:200-225, the `for sync := 1 to frames` body):
 *   1. compute the new camera position into putki[100] (uses the CURRENT sx/sy, before increment)
 *   2. shift putki[1..100] → putki[0..99]
 *   3. advance sx/sy
 *   4. set the 8-tick colour band on the freshest ring (putki[99]); the end fade zeroes it
 *   5. advance the frame counter (clamped at VEKE)
 * The original's `y` term is a stale integer left 0, so sinit[y & 4095] = sinit[0] = 0 — preserved as
 * the literal `+ 0`. Index masks keep every table read in range; `?? 0` satisfies noUncheckedIndexedAccess.
 */
export function stepTunnel(s: TunnelState, sinit: Int16Array, cosit: Int16Array): void {
  const { sx, sy } = s;
  const nx = (cosit[sy & 2047] ?? 0) - (sinit[(sy * 3) & 4095] ?? 0) - (cosit[sx & 2047] ?? 0);
  const ny = (sinit[(sx * 2) & 4095] ?? 0) - (cosit[sx & 2047] ?? 0) + 0;
  s.cx[100] = nx;
  s.cy[100] = ny;
  s.cc[100] = 0;
  // move(putki[1] → putki[0], 100 records): copy indices [1,101) down to start at 0.
  s.cx.copyWithin(0, 1, 101);
  s.cy.copyWithin(0, 1, 101);
  s.cc.copyWithin(0, 1, 101);
  s.sy++;
  s.sx++;
  s.cc[99] = (s.sy & 15) > 7 ? 128 : 64;
  if (s.frame >= VEKE - 102) s.cc[99] = 0;
  if (s.frame < VEKE) s.frame++;
}
