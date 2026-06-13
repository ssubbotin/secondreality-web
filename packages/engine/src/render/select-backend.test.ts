import { describe, expect, it } from 'vitest';
import { selectBackend } from './select-backend.js';

describe('selectBackend', () => {
  it('uses webgpu when available and not Safari', () => {
    expect(selectBackend({ hasWebGPU: true, isSafari: false, allowWebGPUOnSafari: false })).toBe(
      'webgpu',
    );
  });

  it('falls back to webgl2 when WebGPU is unavailable', () => {
    expect(selectBackend({ hasWebGPU: false, isSafari: false, allowWebGPUOnSafari: false })).toBe(
      'webgl2',
    );
  });

  it('defaults Safari to webgl2 even when WebGPU is present (until proven)', () => {
    expect(selectBackend({ hasWebGPU: true, isSafari: true, allowWebGPUOnSafari: false })).toBe(
      'webgl2',
    );
  });

  it('honors the explicit Safari-WebGPU opt-in flag', () => {
    expect(selectBackend({ hasWebGPU: true, isSafari: true, allowWebGPUOnSafari: true })).toBe(
      'webgpu',
    );
  });
});
