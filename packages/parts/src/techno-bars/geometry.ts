import { sinAt } from './sin1024.js';

/** One bar quad, corners in the original 320×200 screen space (integers). */
export interface Quad {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
}

const trunc = Math.trunc;

/**
 * The 11 rotating bars from rotation phase `rot` and scale `vm`, ported verbatim from
 * KOE.C doit1/doit2 (integer arithmetic). `c` runs -10..10 step 2 (11 bars), each offset
 * along the short axis by `vx*c*2 / vy*c*2`.
 */
export function barQuads(rot: number, vm: number, centerX = 160, centerY = 100): Quad[] {
  const hx = trunc((sinAt(rot) * 16 * 6) / 5);
  const hy = sinAt(rot + 256) * 16;
  let vx = trunc((sinAt(rot + 256) * 6) / 5);
  let vy = sinAt(rot + 512);
  vx = trunc((vx * vm) / 100);
  vy = trunc((vy * vm) / 100);

  const quads: Quad[] = [];
  for (let c = -10; c < 11; c += 2) {
    const cx = vx * c * 2;
    const cy = vy * c * 2;
    quads.push({
      x1: trunc((-hx - vx + cx) / 16) + centerX,
      y1: trunc((-hy - vy + cy) / 16) + centerY,
      x2: trunc((-hx + vx + cx) / 16) + centerX,
      y2: trunc((-hy + vy + cy) / 16) + centerY,
      x3: trunc((hx + vx + cx) / 16) + centerX,
      y3: trunc((hy + vy + cy) / 16) + centerY,
      x4: trunc((hx - vx + cx) / 16) + centerX,
      y4: trunc((hy - vy + cy) / 16) + centerY,
    });
  }
  return quads;
}
