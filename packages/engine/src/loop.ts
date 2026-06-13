export interface LoopHandle {
  stop(): void;
}

/**
 * Drive a per-frame callback via requestAnimationFrame. `dt` is clamped so a long
 * tab-background stall doesn't produce a huge time step (the clock is re-anchored
 * to audio in Plan 02; here we only need a stable visual loop).
 */
export function startLoop(onFrame: (dtSeconds: number, frame: number) => void): LoopHandle {
  let raf = 0;
  let last = performance.now();
  let frame = 0;
  let running = true;

  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    onFrame(dt, frame++);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
