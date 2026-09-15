import { expect, it } from 'vitest';
import { quat } from 'gl-matrix';
import { Attitude } from '../src/attitude';
import { Motion } from '../src/motion';

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
