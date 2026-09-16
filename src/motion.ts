import { quat } from 'gl-matrix';
import { Attitude } from './attitude';
import { rotationRoute } from './rotation-route';

type Axis = Readonly<[number, number, number]>;
const ROLL_SPEED = Math.PI / 3;
const DRAG_TAU = 0.025;
const SETTLE_SECONDS = 0.075;
const ROTATION_EPSILON_SQUARED = 1e-12;

function separation(a: quat, b: quat): number {
  const sign = quat.dot(a, b) < 0 ? -1 : 1;
  let squared = 0;
  for (let i = 0; i < 4; i++) squared += (a[i] - sign * b[i]) ** 2;
  return squared;
}

// Owns input goals, displayed attitude and motion time. Rendering only reads attitude.
export class Motion {
  readonly attitude = new Attitude();
  private readonly target = new Attitude();
  private readonly keys = new Set<'q' | 'e'>();
  private fast = false;
  private dragging = false;
  private lastTime: number;
  private velocity = 0;
  private fromVelocity = 0;
  private goalVelocity = 0;
  private rampElapsed = 0;
  private rampDuration = 0;
  private settleStart: quat | undefined;
  private settleElapsed = 0;
  private journey: { from: quat; swing: quat; roll: number; elapsed: number; duration: number } | undefined;

  constructor(now = performance.now()) { this.lastTime = now; }

  get moving(): boolean {
    return this.traveling || this.goalVelocity !== 0 || this.rampElapsed < this.rampDuration || !!this.settleStart
      || (this.dragging && separation(this.attitude.rotation, this.target.rotation) > ROTATION_EPSILON_SQUARED);
  }

  get traveling(): boolean { return !!this.journey; }

  centerOn(latitude: number, longitude: number, now: number, reducedMotion = false): void {
    this.advance(now);
    this.stop(now);
    this.target.centerOn(latitude, longitude);
    this.startJourney(quat.clone(this.target.rotation), 0, reducedMotion);
  }

  orientTo(rotation: quat, now: number, reducedMotion = false): void {
    this.advance(now);
    this.stop(now);
    const { swing, roll } = rotationRoute(this.attitude.rotation, rotation);
    quat.copy(this.target.rotation, rotation);
    this.startJourney(swing, roll, reducedMotion);
  }

  private startJourney(swing: quat, roll: number, reducedMotion: boolean): void {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(quat.dot(this.attitude.rotation, this.target.rotation))));
    if (reducedMotion || separation(this.attitude.rotation, this.target.rotation) <= ROTATION_EPSILON_SQUARED) {
      quat.copy(this.attitude.rotation, this.target.rotation);
    } else {
      this.journey = { from: quat.clone(this.attitude.rotation), swing, roll, elapsed: 0,
        duration: 0.45 + angle / Math.PI * 0.75 };
    }
  }

  private interruptJourney(now: number): void {
    if (!this.journey) return;
    this.advance(now);
    this.journey = undefined;
    quat.copy(this.target.rotation, this.attitude.rotation);
  }

  advance(now: number): void {
    const dt = Math.max(0, now - this.lastTime) / 1000;
    this.lastTime = Math.max(now, this.lastTime);
    if (!dt) return;

    if (this.journey) {
      this.journey.elapsed += dt;
      const t = Math.min(1, this.journey.elapsed / this.journey.duration);
      const eased = t * t * (3 - 2 * t);
      quat.slerp(this.attitude.rotation, this.journey.from, this.journey.swing, eased);
      this.attitude.rotate([0, 0, 1], this.journey.roll * eased);
      quat.normalize(this.attitude.rotation, this.attitude.rotation);
      if (t === 1) {
        quat.copy(this.attitude.rotation, this.target.rotation);
        this.journey = undefined;
      }
      return;
    }

    // Exact integral of a smoothstep velocity ramp: independent of frame frequency.
    let angle = 0;
    const rampTime = Math.min(dt, this.rampDuration - this.rampElapsed);
    if (rampTime > 0) {
      const a = this.rampElapsed / this.rampDuration;
      const b = (this.rampElapsed + rampTime) / this.rampDuration;
      const integral = (u: number) => u ** 3 - u ** 4 / 2;
      angle = this.fromVelocity * rampTime
        + (this.goalVelocity - this.fromVelocity) * this.rampDuration * (integral(b) - integral(a));
      this.rampElapsed += rampTime;
      this.velocity = this.fromVelocity + (this.goalVelocity - this.fromVelocity) * b * b * (3 - 2 * b);
    }
    angle += this.goalVelocity * (dt - rampTime);
    if (this.rampElapsed >= this.rampDuration) this.velocity = this.goalVelocity;
    if (angle) {
      this.attitude.rotate([0, 0, 1], angle);
      this.target.rotate([0, 0, 1], angle);
      if (this.settleStart) {
        const delta = quat.setAxisAngle(quat.create(), [0, 0, 1], angle);
        quat.multiply(this.settleStart, delta, this.settleStart);
        quat.normalize(this.settleStart, this.settleStart);
      }
    }

    if (this.dragging) {
      quat.slerp(this.attitude.rotation, this.attitude.rotation, this.target.rotation, -Math.expm1(-dt / DRAG_TAU));
      quat.normalize(this.attitude.rotation, this.attitude.rotation);
      if (separation(this.attitude.rotation, this.target.rotation) <= ROTATION_EPSILON_SQUARED) {
        quat.copy(this.attitude.rotation, this.target.rotation);
      }
    } else if (this.settleStart) {
      this.settleElapsed += dt;
      const t = Math.min(1, this.settleElapsed / SETTLE_SECONDS);
      quat.slerp(this.attitude.rotation, this.settleStart, this.target.rotation, 1 - (1 - t) ** 3);
      quat.normalize(this.attitude.rotation, this.attitude.rotation);
      if (t === 1) {
        quat.copy(this.attitude.rotation, this.target.rotation);
        this.settleStart = undefined;
      }
    }
  }

  setRollKey(key: 'q' | 'e', down: boolean, fast: boolean, now: number): void {
    if (down) this.interruptJourney(now);
    this.advance(now);
    if (down) this.keys.add(key); else this.keys.delete(key);
    this.fast = fast;
    this.retargetRoll();
  }

  setFast(fast: boolean, now: number): void {
    this.advance(now);
    this.fast = fast;
    this.retargetRoll();
  }

  private retargetRoll(): void {
    const direction = Number(this.keys.has('q')) - Number(this.keys.has('e'));
    const goal = direction * ROLL_SPEED * (this.fast ? 2.5 : 1);
    if (goal === this.goalVelocity) return; // Auto-repeat never restarts acceleration.
    this.fromVelocity = this.velocity;
    this.goalVelocity = goal;
    this.rampDuration = goal === 0 ? 0.08 : 0.1;
    this.rampElapsed = 0;
  }

  beginDrag(now: number): void {
    this.interruptJourney(now);
    this.advance(now);
    quat.copy(this.target.rotation, this.attitude.rotation);
    this.settleStart = undefined;
    this.dragging = true;
  }

  drag(from: [number, number], to: [number, number], width: number, height: number, now: number, radiusRatio = 0.6): void {
    this.advance(now);
    this.target.drag(from, to, width, height, radiusRatio);
  }

  rotate(axis: Axis, angle: number, now: number): void {
    this.interruptJourney(now);
    this.advance(now);
    this.target.rotate(axis, angle);
    if (!this.dragging) this.settle();
  }

  endDrag(now: number): void {
    this.advance(now);
    this.dragging = false;
    this.settle();
  }

  private settle(): void {
    if (separation(this.attitude.rotation, this.target.rotation) <= ROTATION_EPSILON_SQUARED) return;
    this.settleStart = quat.clone(this.attitude.rotation);
    this.settleElapsed = 0;
  }

  magnify(factor: number, now = performance.now()): void {
    this.interruptJourney(now);
    this.attitude.magnify(factor);
  }

  stop(now: number): void {
    // Freeze the displayed pose; never catch up time spent hidden or unfocused.
    this.keys.clear();
    this.fast = this.dragging = false;
    this.velocity = this.fromVelocity = this.goalVelocity = 0;
    this.rampElapsed = this.rampDuration = 0;
    this.settleStart = undefined;
    this.journey = undefined;
    quat.copy(this.target.rotation, this.attitude.rotation);
    this.lastTime = now;
  }

  reset(now: number): void {
    this.stop(now);
    this.attitude.reset();
    this.target.reset();
  }
}
