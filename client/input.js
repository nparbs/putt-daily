// Slingshot input: press anywhere, drag back, release to putt.
export const W = 180, H = 320;
const MAX_DRAG = 34;   // internal px of drag for full power (~11% of screen height)
const CURVE = 1.4;     // >1 = gentler at the start, so short putts keep fine control
const MIN_DRAG = 6;    // below this on release = cancel

export function createInput(canvas, { canAim, onShot, onTap }) {
  let drag = null;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  function compute() {
    if (!drag) return null;
    const dx = drag.cx - drag.sx, dy = drag.cy - drag.sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return { active: false, len };
    const ax = Math.round(-dx / len * 1000), ay = Math.round(-dy / len * 1000);
    const p = Math.max(1, Math.min(1000, Math.round(Math.pow(Math.min(len, MAX_DRAG) / MAX_DRAG, CURVE) * 1000)));
    return { active: len >= MIN_DRAG && (ax !== 0 || ay !== 0), ax, ay, p, len };
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const p = pos(e);
    if (canAim()) {
      drag = { id: e.pointerId, sx: p.x, sy: p.y, cx: p.x, cy: p.y };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    } else if (onTap) onTap();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pos(e); drag.cx = p.x; drag.cy = p.y;
  });
  const end = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    const a = compute();
    drag = null;
    if (!cancel && a && a.active && canAim()) onShot({ ax: a.ax, ay: a.ay, p: a.p });
  };
  canvas.addEventListener('pointerup', e => end(e, false));
  canvas.addEventListener('pointercancel', e => end(e, true));
  for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu'])
    canvas.addEventListener(ev, e => e.preventDefault(), { passive: false });

  return { aim: () => { const a = compute(); return a && a.active ? a : null; } };
}
