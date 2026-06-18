// The lens bounce path — MAIN.C part2's SAVEPATH generator (MAIN.C:140-168).
//
// The shipped binary replays a recorded path (LENSEXP), but the recording is produced by this gravity
// bounce, so the generator is the deterministic source of truth. x,y,xa,ya are 1/64 fixed-point ints;
// each frame drawlens is called at (x/64, y/64) and then the physics advances. C integer arithmetic
// truncates toward zero — reproduced with Math.trunc on every division.

/** Truncating integer division toward zero (C `/` on ints). */
function cdiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export interface PathState {
  x: number; // 1/64 fixed-point screen x
  y: number; // 1/64 fixed-point screen y
  xa: number; // x velocity
  ya: number; // y velocity (gravity adds +2 each frame)
  firstBounce: boolean;
  frame: number;
}

/** Initial state (MAIN.C part2:140-143). */
export const INIT_PATH: PathState = {
  x: 65 * 64,
  y: -50 * 64,
  xa: 64,
  ya: 64,
  firstBounce: true,
  frame: 0,
};

/** part2 frame budget (MAIN.C: while(uframe<715)). */
export const LENS_FRAMES = 715;

/** One frame: the emitted lens pose (x/64, y/64) plus the advanced state. */
export function stepPath(s: PathState): { state: PathState; x: number; y: number } {
  let { x, y, xa, ya, firstBounce, frame } = s;
  const poseX = cdiv(x, 64);
  const poseY = cdiv(y, 64);

  x += xa;
  y += ya;
  if (x > 256 * 64 || x < 60 * 64) xa = -xa;
  if (y > 150 * 64 && frame < 600) {
    y -= ya;
    if (firstBounce) {
      ya = cdiv(-ya * 2, 3);
      firstBounce = false;
    } else {
      ya = cdiv(-ya * 9, 10);
    }
  }
  ya += 2;
  frame += 1;

  return { state: { x, y, xa, ya, firstBounce, frame }, x: poseX, y: poseY };
}
