import { glMatrix, quat } from 'gl-matrix';

// Split the relative orientation into a shortest center swing and screen roll.
// Working directly with quaternions avoids a lossy round trip through latitude
// and longitude, especially at the poles.
export function rotationRoute(from: quat, to: quat): { swing: quat; roll: number } {
  const change = quat.multiply(quat.create(), to, quat.conjugate(quat.create(), from));
  quat.normalize(change, change);
  const twistLength = Math.hypot(change[2], change[3]);

  // Opposite centers make the swing/twist split indeterminate. Their full
  // relative orientation is already a half-turn about a screen-plane axis:
  // it selects a shortest center path with zero extra roll. Treat Float32
  // roundoff as the same degeneracy instead of amplifying it into a twist.
  if (twistLength <= glMatrix.EPSILON) return { swing: quat.clone(to), roll: 0 };

  const twist = quat.fromValues(0, 0, change[2] / twistLength, change[3] / twistLength);
  const swing = quat.multiply(quat.create(), quat.conjugate(quat.create(), twist), change);
  quat.multiply(swing, swing, from);
  quat.normalize(swing, swing);
  const angle = 2 * Math.atan2(twist[2], twist[3]);
  return { swing, roll: Math.atan2(Math.sin(angle), Math.cos(angle)) };
}
