import { quat, vec3 } from 'gl-matrix';

export class Attitude {
  readonly rotation = quat.create();
  zoom = 1;

  constructor() { this.reset(); }

  reset(): void {
    // Preserve the chosen view, including its tilt and roll, on load and reset.
    quat.set(this.rotation,
      0.4176124632358551, -0.19188641011714935,
      -0.5339241623878479, 0.7097213864326477);
    this.zoom = 1;
  }

  rotate(axis: Readonly<[number, number, number]>, angle: number): void {
    const change = quat.setAxisAngle(quat.create(), axis, angle);
    quat.multiply(this.rotation, change, this.rotation);
    quat.normalize(this.rotation, this.rotation);
  }

  centerOn(latitude: number, longitude: number): void {
    const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
    const point = vec3.transformQuat(vec3.create(),
      [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], this.rotation);
    // The shortest swing to screen-forward transports the view along a great
    // circle without adding roll. At the exact antipode, choose a stable axis.
    const length = Math.hypot(point[0], point[1]);
    const axis: [number, number, number] = length > 1e-8
      ? [point[1] / length, -point[0] / length, 0] : [0, 1, 0];
    this.rotate(axis, Math.atan2(length, point[2]));
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
