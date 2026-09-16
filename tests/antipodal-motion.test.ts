import { expect, it } from 'vitest';
import { quat, vec3 } from 'gl-matrix';
import { Attitude } from '../src/attitude';
import { Motion } from '../src/motion';
import { viewPresets } from '../src/view-presets';

const northPole = viewPresets.find(({ id }) => id === 'northPole')!;
const southPole = viewPresets.find(({ id }) => id === 'southPole')!;

function center(rotation: quat): vec3 {
  return vec3.transformQuat(vec3.create(), [0, 0, 1], quat.conjugate(quat.create(), rotation));
}

function distance(a: vec3, b: vec3): number {
  return Math.atan2(vec3.length(vec3.cross(vec3.create(), a, b)), vec3.dot(a, b));
}

function poseError(actual: quat, expected: quat): number {
  const sign = quat.dot(actual, expected) < 0 ? -1 : 1;
  return Math.hypot(...Array.from(actual, (value, index) => value - sign * expected[index]));
}

// This remains well-conditioned as the relative angle approaches zero.
function relativeAngle(from: quat, to: quat): number {
  const delta = quat.multiply(quat.create(), to, quat.conjugate(quat.create(), from));
  return 2 * Math.atan2(Math.hypot(delta[0], delta[1], delta[2]), Math.abs(delta[3]));
}

function premultiplyScreenHalfTurn(initial: quat, axis: [number, number, number]): quat {
  const halfTurn = quat.setAxisAngle(quat.create(), axis, Math.PI);
  return quat.multiply(quat.create(), halfTurn, initial);
}

function checkAntipodalJourney(initial: quat, target: quat): void {
  const motion = new Motion(0);
  quat.copy(motion.attitude.rotation, initial);
  motion.magnify(2, 0);
  const start = center(initial);
  const destination = center(target);
  const totalCenterDistance = distance(start, destination);
  let previous = quat.clone(initial);
  let traveledOrientation = 0;

  motion.orientTo(target, 0);
  for (let now = 10; now <= 2000; now += 10) {
    motion.advance(now);
    traveledOrientation += relativeAngle(previous, motion.attitude.rotation);
    previous = quat.clone(motion.attitude.rotation);
    const current = center(motion.attitude.rotation);
    expect(distance(start, current) + distance(current, destination)).toBeCloseTo(totalCenterDistance, 5);
    expect(motion.attitude.zoom).toBe(2);
  }

  expect(poseError(motion.attitude.rotation, target)).toBeLessThan(2e-6);
  expect(traveledOrientation).toBeCloseTo(Math.PI, 3);
  expect(motion.traveling).toBe(false);
}

it('takes a single half-turn from either pole without adding roll', () => {
  checkAntipodalJourney(northPole.rotation, southPole.rotation);
  checkAntipodalJourney(southPole.rotation, northPole.rotation);
});

it('takes a single half-turn for synthetic opposite centers and a near-antipodal perturbation', () => {
  const initial = quat.create();
  quat.rotateX(initial, initial, 0.63);
  quat.rotateY(initial, initial, -1.17);
  quat.rotateZ(initial, initial, 0.41);
  for (const axis of [[1, 0, 0], [0, 1, 0]] as [number, number, number][]) {
    const target = premultiplyScreenHalfTurn(initial, axis);
    checkAntipodalJourney(initial, target);

    const perturbation = quat.setAxisAngle(quat.create(), [0, 1, 0], 1e-7);
    const nearTarget = quat.multiply(quat.create(), perturbation, target);
    checkAntipodalJourney(initial, nearTarget);
  }
});

it('retargets an in-flight journey, preserves zoom, and supports reduced motion', () => {
  const initial = new Attitude().rotation;
  const firstTarget = southPole.rotation;
  const finalTarget = premultiplyScreenHalfTurn(initial, [0, 1, 0]);
  const motion = new Motion(0);
  quat.copy(motion.attitude.rotation, initial);
  motion.magnify(2.5, 0);
  motion.orientTo(firstTarget, 0);
  motion.advance(300);
  expect(motion.traveling).toBe(true);
  motion.orientTo(finalTarget, 300);
  motion.advance(2000);
  expect(poseError(motion.attitude.rotation, finalTarget)).toBeLessThan(2e-6);
  expect(motion.attitude.zoom).toBe(2.5);
  expect(motion.traveling).toBe(false);

  motion.orientTo(northPole.rotation, 2000, true);
  expect(poseError(motion.attitude.rotation, northPole.rotation)).toBeLessThan(2e-6);
  expect(motion.attitude.zoom).toBe(2.5);
  expect(motion.traveling).toBe(false);
});
