/** The rotozoomer animation state (MAIN.C part3 SAVEPATH generator). */
export interface PathState {
  d1: number; // position-wobble angle
  d2: number; // rotation angle
  d3: number; // angular rate (accelerates)
  scale: number; // zoom
  scalea: number; // zoom rate
  frame: number;
}

/** Initial state (MAIN.C part3:204-210). */
export const INIT_PATH: PathState = {
  d1: 0,
  d2: 0.00007654321,
  d3: 0,
  scale: 2,
  scalea: -0.01,
  frame: 0,
};

/** Total frames in the run (MAIN.C: while(frame<2000)). */
export const ROTO_FRAMES = 2000;

/** One frame of the spline: the emitted pose {x,y,xa,ya} plus the advanced state. */
export function stepPath(s: PathState): {
  state: PathState;
  x: number;
  y: number;
  xa: number;
  ya: number;
} {
  let { d1, d2, d3, scale, scalea, frame } = s;
  let x = 70 * Math.sin(d1) - 30;
  let y = 70 * Math.cos(d1) + 60;
  d1 -= 0.005;
  const xa = -1024 * Math.sin(d2) * scale;
  const ya = 1024 * Math.cos(d2) * scale;
  x -= xa / 16;
  y -= ya / 16;
  d2 += d3;
  // (pose is emitted here, then the rates evolve for the next frame)
  scale += scalea;
  if (frame > 25 && d3 < 0.02) d3 += 0.00005; // verbatim MAIN.C: if(frame>25) (frame is pre-increment here)
  if (frame < 270) {
    if (scale < 0.9 && scalea < 1) scalea += 0.0001;
  } else if (frame < 400) {
    if (scalea > 0.001) scalea -= 0.0001;
  } else if (frame > 1600) {
    if (scalea > -0.1) scalea -= 0.001;
  } else if (frame > 1100) {
    const a = Math.min(frame - 900, 100);
    if (scalea < 256) scalea += 0.000001 * a;
  }
  frame += 1;
  return { state: { d1, d2, d3, scale, scalea, frame }, x, y, xa, ya };
}

/** Start/end brightness fade (0..1), reproducing part3's palette fade-in (16f) / fade-out (last 128f). */
export function fadeLevel(frame: number): number {
  if (frame < 16) return Math.max(0, frame / 16);
  if (frame >= ROTO_FRAMES - 128) return Math.max(0, (ROTO_FRAMES - frame) / 128);
  return 1;
}
