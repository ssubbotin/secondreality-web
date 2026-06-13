import { AudioEngine, type Backend, createRenderer, startLoop } from '@sr/engine';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene } from 'three';
import { positionLocal, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const offIn = document.getElementById('off') as HTMLInputElement;
const offVal = document.getElementById('offval') as HTMLSpanElement;

// ?backend=webgl2 forces the fallback path for testing the co-primary backend.
const forced = new URLSearchParams(location.search).get('backend') as Backend | null;

const { renderer, backend, ready } = createRenderer({
  canvas,
  ...(forced !== null && { forceBackend: forced }),
  onDeviceLost: (reason) => {
    hud.textContent = `DEVICE LOST: ${reason}\n(reload to recover)`;
  },
});

const scene = new Scene();
const camera = new PerspectiveCamera(60, 1, 0.1, 100);
camera.position.z = 3;
const material = new MeshBasicNodeMaterial();
material.colorNode = vec4(positionLocal.add(0.5), 1.0);
const cube = new Mesh(new BoxGeometry(1, 1, 1), material);
scene.add(cube);

const audio = new AudioEngine({
  workletUrl: '/worklets/player-worklet.js',
  wasmUrl: '/vendor/libopenmpt.wasm',
  moduleUrl: '/music/MUSIC0.S3M',
});

playBtn.addEventListener('click', async () => {
  await audio.start(); // inside the user gesture (autoplay policy)
  playBtn.textContent = '⏸ playing';
});
offIn.addEventListener('input', () => {
  const ms = Number(offIn.value);
  audio.setAvOffset(ms);
  offVal.textContent = `${Math.round(ms * 1000)}ms`;
});

function resize() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let fps = 0;
let acc = 0;
let count = 0;

try {
  await ready;
} catch (err) {
  hud.textContent = `INIT FAILED: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
}
resize();

startLoop((dt) => {
  const clk = audio.sample();
  // Spin is a pure function of SONG TIME — it freezes if audio is paused/stalled.
  cube.rotation.y = clk.songSeconds * 1.2;
  cube.rotation.x = clk.songSeconds * 0.7;
  renderer.render(scene, camera);

  acc += dt;
  count++;
  if (acc >= 0.5) {
    fps = Math.round(count / acc);
    hud.textContent =
      `backend: ${backend}  fps: ${fps}\n` +
      `song: ${clk.songSeconds.toFixed(2)}s  ord:${clk.order} row:${clk.row} pat:${clk.pattern}\n` +
      `bpm: ${clk.bpm.toFixed(0)}`;
    acc = 0;
    count = 0;
  }
});
