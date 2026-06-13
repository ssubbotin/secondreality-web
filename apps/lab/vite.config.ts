import { defineConfig } from 'vite';

export default defineConfig({
  // Three's WebGPU build ships modern syntax; keep esnext so it isn't down-leveled.
  build: { target: 'esnext' },
  server: { port: 5180 },
});
