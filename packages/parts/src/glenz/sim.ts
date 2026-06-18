import { sinAt } from './sin1024.js';

// Per-tick glenz animation, ported verbatim from GLENZ/MAIN.C's `while(repeat--)` block (MAIN.C:417-591).
// Drives the rotation angles, the two solids' scales, the entry "jello" bounce, the vertical position and
// the sin1024 position wobble. The palette / FC-picture manipulation in that block is deferred (see
// STATUS) — only the geometry-affecting state is reproduced here. C integer division truncates toward
// zero (Math.trunc); 16-bit `int` wrap is not reached by these magnitudes within the part's frame range.

/** Truncating integer division (C `/` on ints). */
const idiv = (a: number, b: number): number => Math.trunc(a / b);

export interface GlenzState {
  frame: number;
  rx: number;
  ry: number;
  rz: number;
  xscale: number;
  yscale: number;
  zscale: number;
  bscale: number;
  ypos: number;
  yposa: number;
  jello: number;
  jelloa: number;
  boingm: number;
  boingd: number;
  oxp: number;
  oyp: number;
  ozp: number;
  oxb: number;
  oyb: number;
  ozb: number;
  lightshift: number;
}

/** MAIN.C initial state (the int declarations at the top of main + the pre-loop `rx=ry=rz=0; ypos=-9000`). */
export function createGlenzState(): GlenzState {
  return {
    frame: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    xscale: 120,
    yscale: 120,
    zscale: 120,
    bscale: 0,
    ypos: -9000,
    yposa: 0,
    jello: 0,
    jelloa: 0,
    boingm: 6,
    boingd: 7,
    oxp: 0,
    oyp: 0,
    ozp: 0,
    oxb: 0,
    oyb: 0,
    ozb: 0,
    lightshift: 9,
  };
}

/** Advance one 70 Hz tick (one iteration of MAIN.C's `while(repeat--)`). */
export function stepGlenz(s: GlenzState): void {
  s.frame++;
  s.rx += 32;
  s.ry += 7;
  s.rx %= 3 * 3600;
  s.ry %= 3 * 3600;
  s.rz %= 3 * 3600;

  if (s.frame > 900) {
    let a = s.frame - 900;
    let b = s.frame - 900;
    if (b > 50) b = 50;
    s.oxp = idiv(sinAt(a * 3) * b, 10);
    s.oyp = idiv(sinAt(a * 5) * b, 10);
    s.ozp = idiv((idiv(sinAt(a * 4), 2) + 128) * b, 16);
    if (s.frame > 1800) {
      a = s.frame - 1800 + 64;
      if (a > 1024) a = 1024;
      s.oxb = idiv(-sinAt(a * 6) * a, 40);
      s.oyb = idiv(-sinAt(a * 7) * a, 40);
      s.ozb = idiv((sinAt(a * 8) + 128) * a, 40);
    } else {
      s.oxb = -sinAt(a * 6);
      s.oyb = -sinAt(a * 7);
      s.ozb = sinAt(a * 8) + 128;
    }
    b = 1800 - s.frame;
    if (b < 0) {
      if (b < -99) b = -99;
      s.oyp -= idiv(b * b, 2);
    }
  }

  if (s.frame > 800) {
    if (s.frame > 1220 + 789) {
      if (s.xscale > 0) s.xscale -= 1;
      if (s.yscale > 0) s.yscale -= 1;
      if (s.zscale > 0) s.zscale -= 1;
      if (s.bscale > 0) s.bscale -= 1;
    } else if (s.frame > 1400 + 789) {
      if (s.bscale > 0) s.bscale -= 8;
      if (s.bscale < 0) s.bscale = 0;
    } else {
      if (s.bscale < 180) s.bscale += 2;
      else s.bscale = 180;
    }
    if (s.bscale > s.xscale) s.lightshift = 10;
  } else {
    if (s.frame < 640 + 70) {
      s.yposa += 31;
      s.ypos += idiv(s.yposa, 40);
      if (s.ypos > -300) {
        s.ypos -= idiv(s.yposa, 40);
        s.yposa = idiv(-s.yposa * s.boingm, s.boingd);
        s.boingm += 2;
        s.boingd++;
      }
      if (s.ypos > -900 && s.yposa > 0) {
        s.jello = idiv((s.ypos + 900) * 5, 3);
        s.jelloa = 0;
      }
    } else {
      if (s.ypos > -2800) s.ypos -= 16;
      else if (s.ypos < -2800) s.ypos += 16;
    }
    s.yscale = s.xscale = 120 + idiv(s.jello, 30);
    s.zscale = 120 - idiv(s.jello, 30);
    const a = s.jello;
    s.jello += s.jelloa;
    if ((a < 0 && s.jello > 0) || (a > 0 && s.jello < 0)) {
      s.jelloa = idiv(s.jelloa * 5, 6);
    }
    const ja = idiv(s.jello, 20);
    s.jelloa -= ja;
  }
}
