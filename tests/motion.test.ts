import { expect, it } from 'vitest';
import { quat, vec3 } from 'gl-matrix';
import { Attitude } from '../src/attitude';
import { Motion } from '../src/motion';
import { viewPresets } from '../src/view-presets';
import { geographicDirection } from '../src/coordinates';

function expectPose(actual: quat, expected: quat): void {
  const sign = quat.dot(actual, expected) < 0 ? -1 : 1;
  expect(Math.hypot(...Array.from(actual, (v, i) => v - sign * expected[i]))).toBeLessThan(2e-6);
}

it('integrates held roll and both ramps equally at 30, 60 and 144 Hz, ignoring key-repeat restarts', () => {
  const expected = new Attitude();
  // One-second hold: 50ms equivalent lost to acceleration, 40ms gained on release.
  expected.rotate([0, 0, 1], Math.PI / 3 * 0.99);
  for (const fps of [30, 60, 144]) {
    const motion = new Motion(0);
    motion.setRollKey('q', true, false, 0);
    expectPose(motion.attitude.rotation, new Attitude().rotation);
    for (let frame = 1; frame <= fps; frame++) {
      const now = frame * 1000 / fps;
      motion.advance(now);
      motion.setRollKey('q', true, false, now);
    }
    motion.setRollKey('q', false, false, 1000);
    expect(motion.moving).toBe(true);
    motion.advance(1080);
    expect(motion.moving).toBe(false);
    expectPose(motion.attitude.rotation, expected.rotation);
    motion.advance(5000);
    expectPose(motion.attitude.rotation, expected.rotation);
  }
});

it('cancels opposing keys and clears motion on interruption and reset', () => {
  const motion = new Motion(0);
  motion.setRollKey('q', true, false, 0);
  motion.advance(100);
  motion.setRollKey('e', true, false, 100);
  motion.advance(180);
  const stopped = quat.clone(motion.attitude.rotation);
  expect(motion.moving).toBe(false);
  motion.advance(1000);
  expectPose(motion.attitude.rotation, stopped);
  motion.setRollKey('q', false, true, 1000);
  motion.advance(1100);
  expect(Math.abs(quat.dot(stopped, motion.attitude.rotation))).toBeLessThan(0.9999);
  motion.stop(1100);
  const interrupted = quat.clone(motion.attitude.rotation);
  motion.advance(60_000);
  expectPose(motion.attitude.rotation, interrupted);
  expect(motion.moving).toBe(false);
  motion.reset(60_000);
  motion.advance(70_000);
  expectPose(motion.attitude.rotation, new Attitude().rotation);
});

it('smoothly follows a drag, settles to its exact target in 75ms and allows immediate re-grabbing', () => {
  const motion = new Motion(0);
  const target = new Attitude();
  target.drag([500, 300], [750, 450], 1200, 760);
  const initial = quat.clone(motion.attitude.rotation);
  motion.beginDrag(0);
  motion.drag([500, 300], [750, 450], 1200, 760, 0);
  expectPose(motion.attitude.rotation, initial);
  motion.advance(25);
  expect(Math.abs(quat.dot(initial, motion.attitude.rotation))).toBeLessThan(0.999);
  expect(Math.abs(quat.dot(target.rotation, motion.attitude.rotation))).toBeLessThan(0.999);
  motion.endDrag(25);
  motion.advance(100);
  expectPose(motion.attitude.rotation, target.rotation);
  expect(motion.moving).toBe(false);
  motion.beginDrag(100);
  motion.rotate([0, 1, 0], 0.7, 100);
  motion.endDrag(110);
  motion.advance(135);
  const visible = quat.clone(motion.attitude.rotation);
  motion.beginDrag(135);
  motion.advance(1000);
  expectPose(motion.attitude.rotation, visible);
  expect(motion.moving).toBe(false);
});

it('composes keyboard roll with drag settling once, without a second smoothing delay', () => {
  const motion = new Motion(0);
  const expected = new Attitude();
  expected.rotate([1, 0, 0], 0.4);
  motion.beginDrag(0);
  motion.rotate([1, 0, 0], 0.4, 0);
  motion.endDrag(25);
  motion.setRollKey('q', true, false, 25);
  motion.advance(100);
  const u = 0.75;
  expected.rotate([0, 0, 1], Math.PI / 3 * 0.1 * (u ** 3 - u ** 4 / 2));
  expectPose(motion.attitude.rotation, expected.rotation);
  expect(quat.length(motion.attitude.rotation)).toBeCloseTo(1, 6);
});

const center = (rotation: quat) => vec3.transformQuat(vec3.create(), [0, 0, 1], quat.conjugate(quat.create(), rotation));
const distance = (a: vec3, b: vec3) => Math.atan2(vec3.length(vec3.cross(vec3.create(), a, b)), vec3.dot(a, b));

it('restores every complete preset while keeping the center on a shortest great circle and retaining zoom', () => {
  for (const preset of viewPresets) {
    const destination = geographicDirection(preset);
    expect(distance(center(preset.rotation), destination)).toBeLessThan(1e-6);
    if (Math.abs(preset.latitude) < 90) {
      const pole = vec3.transformQuat(vec3.create(), [0, Math.sign(preset.latitude), 0], preset.rotation);
      expect(pole[0]).toBeCloseTo(0, 6);
      expect(pole[1]).toBeGreaterThan(0);
    } else {
      for (const longitude of [0, 180]) {
        const meridian = vec3.transformQuat(vec3.create(),
          geographicDirection({ latitude: 0, longitude }), preset.rotation);
        expect(meridian[0]).toBeCloseTo(0, 6);
        expect(meridian[1]).toBeCloseTo(longitude === 0 ? 1 : -1, 6);
      }
    }
    for (const initial of [new Attitude().rotation, ...viewPresets.map(p => p.rotation)]) {
      const motion = new Motion(0);
      quat.copy(motion.attitude.rotation, initial);
      motion.magnify(2, 0);
      const start = center(initial);
      const total = distance(start, destination);
      motion.orientTo(preset.rotation, 0);
      let previous = total;
      for (let now = 50; now <= 1500; now += 50) {
        motion.advance(now);
        const current = center(motion.attitude.rotation);
        const remaining = distance(current, destination);
        expect(distance(start, current) + remaining).toBeCloseTo(total, 5);
        expect(remaining).toBeLessThanOrEqual(previous + 1e-6);
        previous = remaining;
        expect(motion.attitude.zoom).toBe(2);
      }
      expectPose(motion.attitude.rotation, preset.rotation);
      expect(motion.moving).toBe(false);
    }
  }
});

it('handles preset roll at a fixed center, immediate arrival, supersession and manual interruption', () => {
  const motion = new Motion(0);
  const rolled = quat.clone(motion.attitude.rotation);
  const turn = quat.setAxisAngle(quat.create(), [0, 0, 1], Math.PI);
  quat.multiply(rolled, turn, rolled);
  const start = center(rolled);
  motion.orientTo(rolled, 0);
  motion.advance(300);
  expect(distance(start, center(motion.attitude.rotation))).toBeLessThan(1e-6);
  expect(motion.traveling).toBe(true);
  motion.orientTo(viewPresets[0].rotation, 300);
  motion.advance(500);
  motion.beginDrag(500);
  expect(motion.traveling).toBe(false);
  const stopped = quat.clone(motion.attitude.rotation);
  motion.advance(2000);
  expectPose(motion.attitude.rotation, stopped);
  motion.orientTo(viewPresets[7].rotation, 2000, true);
  expectPose(motion.attitude.rotation, viewPresets[7].rotation);
  expect(motion.moving).toBe(false);
});

it('moves the center on the shortest great circle, including poles, the seam and antipodes, without changing zoom', () => {
  for (const [latitude, longitude] of [[37.5665, 126.978], [90, 0], [-90, 0], [0, 179.9999], [0, 180], [0, 0]]) {
    for (const initial of [new Attitude().rotation, quat.create()]) {
      const motion = new Motion(0);
      quat.copy(motion.attitude.rotation, initial);
      motion.magnify(2, 0);
      const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
      const destination = vec3.fromValues(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      const start = center(initial);
      const total = distance(start, destination);
      let previous = total;
      motion.centerOn(latitude, longitude, 0);
      expectPose(motion.attitude.rotation, initial);
      for (let now = 100; now <= 1600; now += 100) {
        motion.advance(now);
        const current = center(motion.attitude.rotation);
        const remaining = distance(current, destination);
        expect(distance(start, current) + remaining).toBeCloseTo(total, 5);
        expect(remaining).toBeLessThanOrEqual(previous + 1e-6);
        previous = remaining;
        expect(motion.attitude.zoom).toBe(2);
      }
      expect(previous).toBeLessThan(1e-6);
      expect(motion.moving).toBe(false);
      // A pure swing has no extra twist about the screen's forward axis.
      const change = quat.multiply(quat.create(), motion.attitude.rotation, quat.conjugate(quat.create(), initial));
      expect(Math.abs(change[2])).toBeLessThan(1e-6);
    }
  }
});

it('interrupts location travel for direct input and supports immediate reduced-motion arrival', () => {
  for (const interrupt of [
    (m: Motion) => m.beginDrag(250),
    (m: Motion) => m.magnify(1.12, 250),
    (m: Motion) => m.rotate([0, 1, 0], 0.06, 250),
    (m: Motion) => m.setRollKey('q', true, false, 250),
    (m: Motion) => m.stop(250),
    (m: Motion) => m.reset(250),
  ]) {
    const motion = new Motion(0);
    motion.centerOn(37.5665, 126.978, 0);
    motion.advance(250);
    expect(motion.traveling).toBe(true);
    interrupt(motion);
    expect(motion.traveling).toBe(false);
    motion.stop(300);
    const stopped = quat.clone(motion.attitude.rotation);
    motion.advance(5000);
    expectPose(motion.attitude.rotation, stopped);
  }
  const motion = new Motion(0);
  motion.centerOn(90, 0, 0, true);
  expect(distance(center(motion.attitude.rotation), vec3.fromValues(0, 1, 0))).toBeLessThan(1e-6);
  expect(motion.moving).toBe(false);
  motion.centerOn(90, 0, 100);
  expect(motion.moving).toBe(false);
});
