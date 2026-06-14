import { describe, expect, it } from 'vitest';
import { barQuads } from './geometry.js';
import { beatFlashDecay, effectiveVm, initPhaseA, initPhaseB, stepPhase } from './phase.js';

describe('phase — KOE.C doit1/doit2 steppers', () => {
  it('phase A: rot advances by 2 and vm damps from rest', () => {
    let s = initPhaseA(); // { rot:45, vm:50, vma:0, rota:0, kind:'A' }
    s = stepPhase(s);
    expect(s.rot).toBe(47);
    expect(s.vm).toBe(50); // vm += vma(0)
    expect(s.vma).toBe(-1); // vma--
    s = stepPhase(s);
    expect(s.rot).toBe(49);
    expect(s.vm).toBe(49); // 50 + (-1)
    expect(s.vma).toBe(-2);
  });

  it('phase B: rotation accelerates via rota', () => {
    let s = initPhaseB(); // { rot:50, vm:6400, vma:0, rota:10, kind:'B' }
    s = stepPhase(s);
    expect(s.rot).toBe(51); // 50 + trunc(10/10)
    expect(s.rota).toBe(11);
    s = stepPhase(s);
    expect(s.rot).toBe(52); // 51 + trunc(11/10)
    expect(s.rota).toBe(12);
  });

  it('beatFlashDecay drops one level per step toward 0', () => {
    expect(beatFlashDecay(15)).toBe(14);
    expect(beatFlashDecay(1)).toBe(0);
    expect(beatFlashDecay(0)).toBe(0);
  });
});

describe('effectiveVm — phase-B vm is divided back by 64 (doit2)', () => {
  it('phase A passes vm straight through', () => {
    expect(effectiveVm(initPhaseA())).toBe(50);
  });

  it('phase B divides the 100*64 base back to ~100 (not 6400)', () => {
    expect(effectiveVm(initPhaseB())).toBe(100); // 6400 / 64
  });

  it('keeps phase-B bars on-screen (without it they are ~64× oversized)', () => {
    // The blow-up shows in the OUTER bars (c=±10) via the cx = vx*c*2 offset.
    const outer = barQuads(50, effectiveVm(initPhaseB()))[0];
    expect(Math.abs(outer.x1)).toBeLessThan(1000);
    // The unfixed path (raw vm=6400) throws the outer bars tens of thousands of px off-screen.
    const broken = barQuads(50, initPhaseB().vm)[0];
    expect(Math.abs(broken.x1)).toBeGreaterThan(10000);
  });
});
