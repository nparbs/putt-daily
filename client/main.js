import { createSim, shoot, step } from '../shared/physics.js';
import { TEST_HOLES } from '../shared/holes.js';
import { W, H, createInput } from './input.js';
import { buildLayer, drawFrame } from './render.js';
import { drawHud, drawResult, resultLabel, MAX_STROKES } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
}
addEventListener('resize', fit);
fit();

let idx = 0, hole, sim, layer, result = null, resultAt = 0;

function load(i) {
  idx = i % TEST_HOLES.length;
  hole = TEST_HOLES[idx];
  sim = createSim(hole);
  layer = buildLayer(hole);
  result = null;
}
load(0);

const input = createInput(canvas, {
  canAim: () => sim.state === 'rest' && !result,
  onShot: s => { shoot(sim, s); },
  onTap: () => { if (result && performance.now() - resultAt > 350) load(idx + 1); },
});

const DT = 1000 / 120;
let acc = 0, last = performance.now();

function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= DT) {
    acc -= DT;
    if (sim.state === 'moving') step(sim);
  }
  if (!result) {
    if (sim.state === 'holed') {
      result = resultLabel(sim.strokes, hole.par, true); resultAt = now;
    } else if (sim.state === 'rest' && sim.strokes >= MAX_STROKES) {
      result = resultLabel(sim.strokes, hole.par, false); resultAt = now;
    }
  }
  drawFrame(ctx, layer, hole, sim, input.aim(), now);
  drawHud(ctx, hole, hole.name || hole.id, sim.strokes);
  if (result) drawResult(ctx, result, 'Tap for next hole');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
