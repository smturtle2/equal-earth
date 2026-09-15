// Equal Earth on a unit sphere. Longitude/latitude and rotation use radians.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

function polynomial(t: number): [number, number] {
  const t2 = t * t;
  const t6 = t2 * t2 * t2;
  return [
    t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
    A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2),
  ];
}

export function project(longitude: number, latitude: number): [number, number] {
  const t = Math.asin(M * Math.sin(latitude));
  const [y, derivative] = polynomial(t);
  return [longitude * Math.cos(t) / (M * derivative), y];
}

export const MAX_X = project(Math.PI, 0)[0];
export const MAX_Y = project(0, Math.PI / 2)[1];

// A row's inverse latitude and horizontal coefficient are independent of globe attitude.
export function inverseRow(y: number): [number, number, number] {
  let t = Math.max(-MAX_Y, Math.min(MAX_Y, y));
  for (let i = 0; i < 12; i++) {
    const [value, derivative] = polynomial(t);
    const step = (value - Math.max(-MAX_Y, Math.min(MAX_Y, y))) / derivative;
    t -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  const sinLatitude = Math.max(-1, Math.min(1, Math.sin(t) / M));
  return [sinLatitude, Math.sqrt(Math.max(0, 1 - sinLatitude * sinLatitude)), M * polynomial(t)[1] / Math.cos(t)];
}

export function invert(x: number, y: number): [number, number] | null {
  if (Math.abs(y) > MAX_Y + 1e-12) return null;
  const [sinLatitude, , coefficient] = inverseRow(y);
  const longitude = x * coefficient;
  return Math.abs(longitude) <= Math.PI + 1e-12
    ? [longitude, Math.asin(sinLatitude)]
    : null;
}

export function createRows(height: number, scale: number, samples = 1, centerY = height / 2): Float32Array<ArrayBuffer> {
  const rows = new Float32Array(height * samples * 4);
  for (let row = 0; row < height * samples; row++) {
    const y = (centerY - (row + 0.5) / samples) / scale;
    const [sinLatitude, cosLatitude, coefficient] = inverseRow(y);
    // Outside samples belong to the background, never to a clamped sphere point.
    rows.set([sinLatitude, cosLatitude, coefficient, Math.abs(y) <= MAX_Y ? 1 : 0], row * 4);
  }
  return rows;
}
