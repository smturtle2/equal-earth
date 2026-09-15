import { describe, expect, it } from 'vitest';
import { quat, vec3 } from 'gl-matrix';
import { Attitude } from '../src/attitude';
import { createRows, fitScale, invert, MAX_X, MAX_Y, project } from '../src/projection';

describe('spherical Equal Earth', () => {
  it('round-trips the world, including the antimeridian and both poles', () => {
    for (const latitude of [-90, -89.99, -70, -30, 0, 30, 70, 89.99, 90]) {
      for (const longitude of [-180, -179.99, -120, 0, 127, 179.99, 180]) {
        const lon = longitude * Math.PI / 180;
        const lat = latitude * Math.PI / 180;
        const point = invert(...project(lon, lat))!;
        expect(point).not.toBeNull();
        const direction = (a: number, b: number) => [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)] as const;
        expect(vec3.distance(direction(...point), direction(lon, lat))).toBeLessThan(1e-7);
      }
    }
    expect(invert(MAX_X + 0.1, 0)).toBeNull();
    expect(invert(0, MAX_Y + 0.1)).toBeNull();
  });

  it('preserves spherical area at different latitudes', () => {
    const h = 1e-5;
    for (const lat of [-1.4, -0.8, 0, 0.8, 1.4]) {
      const [left] = project(0.7 - h, lat);
      const [right] = project(0.7 + h, lat);
      const [, bottom] = project(0.7, lat - h);
      const [, top] = project(0.7, lat + h);
      const determinant = ((right - left) / (2 * h)) * ((top - bottom) / (2 * h));
      expect(determinant / Math.cos(lat)).toBeCloseTo(1, 7);
    }
  });

  it('keeps the cached GPU row coordinates consistent with direct projection at different sizes and zooms', () => {
    for (const [width, height, zoom] of [[1200, 760, 1], [390, 844, 1], [1200, 760, 4]]) {
      const scale = fitScale(width, height) * zoom;
      const rows = createRows(height, scale);
      for (let y = 0; y < height; y += 17) {
        if (rows[y * 4 + 3] < 1) continue;
        const lat = Math.asin(rows[y * 4]);
        const lon = 0.7;
        const [px, py] = project(lon, lat);
        expect(Math.abs(px - lon / rows[y * 4 + 2]) * scale).toBeLessThan(0.01);
        expect(Math.abs(py - (height / 2 - y - 0.5) / scale) * scale).toBeLessThan(0.01);
      }
    }
  });
});

it('allows repeated pole crossings and compound rotations without changing the unit sphere', () => {
  const attitude = new Attitude();
  const initial = quat.clone(attitude.rotation);
  for (let i = 0; i < 720; i++) attitude.rotate([1, 0, 0], Math.PI / 180);
  expect(Math.abs(quat.dot(initial, attitude.rotation))).toBeCloseTo(1, 5);
  for (let i = 0; i < 1000; i++) {
    attitude.rotate([0, 1, 0], 0.013);
    attitude.rotate([0, 0, 1], -0.007);
    attitude.drag([500, 400], [505, 408], 1200, 760);
  }
  expect(quat.length(attitude.rotation)).toBeCloseTo(1, 6);
  const point = vec3.normalize(vec3.create(), [1, 2, 3]);
  const rotated = vec3.transformQuat(vec3.create(), point, attitude.rotation);
  const restored = vec3.transformQuat(vec3.create(), rotated, quat.conjugate(quat.create(), attitude.rotation));
  expect(vec3.distance(point, restored)).toBeLessThan(1e-6);
});
