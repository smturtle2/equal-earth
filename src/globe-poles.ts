import { vec3, type quat } from 'gl-matrix';
import { GLOBE_RADIUS_RATIO } from './layout';

// Pole labels share the globe's orthographic projection, in CSS pixels.
export function createGlobePoles(canvas: HTMLCanvasElement) {
  const overlay = document.createElement('div');
  overlay.className = 'globe-poles';
  overlay.setAttribute('aria-hidden', 'true');
  const poles = ([['north', 'N', 1], ['south', 'S', -1]] as const).map(([name, text, sign]) => {
    const label = document.createElement('span');
    label.className = 'globe-pole';
    label.dataset.pole = name;
    label.textContent = text;
    label.hidden = true;
    overlay.append(label);
    return { label, sign };
  });
  canvas.after(overlay);
  const direction = vec3.create();
  return {
    draw(rotation: quat, visible: boolean, width: number, height: number) {
      const radius = Math.min(width, height) * GLOBE_RADIUS_RATIO;
      for (const { label, sign } of poles) {
        vec3.set(direction, 0, sign, 0);
        vec3.transformQuat(direction, direction, rotation);
        label.hidden = !visible || direction[2] <= 0;
        if (label.hidden) continue;
        label.style.left = `${width / 2 + direction[0] * radius}px`;
        label.style.top = `${height / 2 - direction[1] * radius}px`;
      }
    },
    destroy() { overlay.remove(); },
  };
}
