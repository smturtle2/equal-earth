import type { Motion } from './motion';

type Point = [number, number];

export function bindInteraction(canvas: HTMLCanvasElement, motion: Motion, invalidate: () => void): void {
  const pointers = new Map<number, Point>();
  const size = () => [canvas.clientWidth, canvas.clientHeight] as const;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    if (!pointers.size) motion.beginDrag(performance.now());
    pointers.set(event.pointerId, [event.offsetX, event.offsetY]);
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const before = [...pointers.values()];
    const next: Point = [event.offsetX, event.offsetY];
    pointers.set(event.pointerId, next);
    const [width, height] = size();
    const now = performance.now();

    if (pointers.size === 1) {
      if (event.shiftKey) motion.rotate([0, 0, 1], (next[0] - previous[0]) * 0.008, now);
      else motion.drag(previous, next, width, height, now);
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const measure = ([a, b]: Point[]) => ({
        middle: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point,
        length: Math.hypot(b[0] - a[0], b[1] - a[1]),
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      });
      const a = measure(before);
      const b = measure(after);
      motion.drag(a.middle, b.middle, width, height, now);
      const angle = a.angle - b.angle;
      motion.rotate([0, 0, 1], Math.atan2(Math.sin(angle), Math.cos(angle)), now);
      if (a.length > 5 && b.length > 5) motion.magnify(b.length / a.length);
    }
    invalidate();
  });

  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, (event) => {
      if (pointers.delete((event as PointerEvent).pointerId) && !pointers.size) {
        motion.endDrag(performance.now());
        invalidate();
      }
    });
  }
  const clearPointers = () => {
    const ids = [...pointers.keys()];
    pointers.clear();
    for (const id of ids) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const cancel = () => { clearPointers(); motion.stop(performance.now()); invalidate(); };
  window.addEventListener('blur', cancel);
  canvas.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    motion.magnify(Math.exp(-event.deltaY * unit * 0.0015));
    invalidate();
  }, { passive: false });

  const reset = () => { clearPointers(); motion.reset(performance.now()); invalidate(); };
  canvas.addEventListener('dblclick', reset);
  canvas.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const angle = event.shiftKey ? 0.15 : 0.06;
    const now = performance.now();
    switch (event.key.toLowerCase()) {
      case 'arrowleft': motion.rotate([0, 1, 0], -angle, now); break;
      case 'arrowright': motion.rotate([0, 1, 0], angle, now); break;
      case 'arrowup': motion.rotate([1, 0, 0], -angle, now); break;
      case 'arrowdown': motion.rotate([1, 0, 0], angle, now); break;
      case 'q': case 'e':
        if (event.repeat) { event.preventDefault(); return; }
        motion.setRollKey(event.key.toLowerCase() as 'q' | 'e', true, event.shiftKey, now); break;
      case 'shift': motion.setFast(true, now); break;
      case '+': case '=': motion.magnify(1.12); break;
      case '-': motion.magnify(1 / 1.12); break;
      case '0': case 'home': reset(); break;
      default: return;
    }
    event.preventDefault();
    invalidate();
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'q' || key === 'e') motion.setRollKey(key, false, event.shiftKey, performance.now());
    else if (key === 'shift') motion.setFast(false, performance.now());
    else return;
    invalidate();
  });
}
