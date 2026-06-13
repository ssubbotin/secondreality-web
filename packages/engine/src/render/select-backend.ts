import type { Backend } from '../types.js';

export interface BackendInputs {
  hasWebGPU: boolean;
  isSafari: boolean;
  /** Escape hatch: allow WebGPU on Safari once it's proven for a build. */
  allowWebGPUOnSafari: boolean;
}

/** Pure decision: which Three.js backend to force. See spec section 4. */
export function selectBackend(i: BackendInputs): Backend {
  if (!i.hasWebGPU) return 'webgl2';
  if (i.isSafari && !i.allowWebGPUOnSafari) return 'webgl2';
  return 'webgpu';
}
