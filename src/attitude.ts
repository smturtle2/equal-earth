import { quat, vec3 } from 'gl-matrix';

export class Attitude {
  readonly rotation = quat.create();
  zoom = 1;

  constructor() { this.reset(); }

  reset(): void {
    // Start over the Pacific; no north-up constraint is applied after this.
    quat.setAxisAngle(this.rotation, [0, 1, 0], -135 * Math.PI / 180);
    this.zoom = 1;
  }

  rotate(axis: Readonly<[number, number, number]>, angle: number): void {
    const change = quat.setAxisAngle(quat.create(), axis, angle);
    quat.multiply(this.rotation, change, this.rotation);
    quat.normalize(this.rotation, this.rotation);
  }

  drag(from: [number, number], to: [number, number], width: number, height: number, radiusRatio = 0.6): void {
    const a = trackball(from, width, height, radiusRatio);
    const b = trackball(to, width, height, radiusRatio);
    const change = quat.rotationTo(quat.create(), a, b);
    quat.multiply(this.rotation, change, this.rotation);
    quat.normalize(this.rotation, this.rotation);
  }

  magnify(factor: number): void { this.zoom = Math.max(1, Math.min(4, this.zoom * factor)); }
}

function trackball(point: [number, number], width: number, height: number, radiusRatio: number): vec3 {
  const radius = Math.min(width, height) * radiusRatio;
  const x = (point[0] - width / 2) / radius;
  const y = (height / 2 - point[1]) / radius;
  const d2 = x * x + y * y;
  const z = d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2);
  return vec3.normalize(vec3.create(), [x, y, z]);
}
