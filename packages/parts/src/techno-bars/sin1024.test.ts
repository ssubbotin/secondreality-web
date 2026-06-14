import { describe, expect, it } from 'vitest';
import { sin1024 } from './sin1024.js';

describe('sin1024 — faithful port of TECHNO/SIN1024.INC', () => {
  it('has 1024 entries', () => {
    expect(sin1024.length).toBe(1024);
  });

  it('matches published table values (amplitude 256, truncated toward zero)', () => {
    // Spot values read directly from SIN1024.INC.
    expect(sin1024[0]).toBe(0);
    expect(sin1024[1]).toBe(1); // trunc(256*sin(2pi/1024)) = trunc(1.57)
    expect(sin1024[2]).toBe(3);
    expect(sin1024[128]).toBe(181); // trunc(256*sin(pi/4))
    expect(sin1024[256]).toBe(256); // peak
    expect(sin1024[512]).toBe(0);
    expect(sin1024[768]).toBe(-256); // trough
  });
});
