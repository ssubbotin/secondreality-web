import { describe, expect, it } from 'vitest';
import { beatFlashDecay, initPhaseA, initPhaseB, stepPhase } from './phase.js';

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
