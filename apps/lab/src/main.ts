import {
  AudioEngine,
  type Backend,
  createRenderer,
  type MarkerTable,
  MusicSync,
  startLoop,
} from '@sr/engine';
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
  moduleUrl: '/music/MUSIC0.S3M',
});

const markerTable = (await fetch('/music/markers-music0.json').then((r) =>
  r.json(),
)) as MarkerTable;
const music = new MusicSync(markerTable);
let lastMuscode = -1;
let flash = 0;

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
  const clk = music.resolve(audio.sample());

  // Pulse the cube when a new Zxx marker fires (muscode changes); spin stays song-time driven.
  if (clk.muscode !== lastMuscode) {
    lastMuscode = clk.muscode;
    flash = 1;
  }
  flash = Math.max(0, flash - dt * 4);
  cube.rotation.y = clk.songSeconds * 1.2;
  cube.rotation.x = clk.songSeconds * 0.7;
  cube.scale.setScalar(1 + flash * 0.35);

  renderer.render(scene, camera);

  acc += dt;
  count++;
  if (acc >= 0.25) {
    const fps = Math.round(count / acc);
    hud.textContent =
      `backend: ${backend}  fps: ${fps}\n` +
      `song: ${clk.songSeconds.toFixed(2)}s  ord:${clk.order} row:${clk.musrow} pat:${clk.pattern} bpm:${clk.bpm.toFixed(0)}\n` +
      `muscode: 0x${clk.muscode.toString(16)}  musplus: ${clk.musplus}  mframe: ${clk.mframe}`;
    acc = 0;
    count = 0;
  }
});
