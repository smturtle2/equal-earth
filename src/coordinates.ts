import { quat, vec3 } from 'gl-matrix';

export type Coordinates = { latitude: number; longitude: number };
const DEGREES = 180 / Math.PI;

export function geographicDirection({ latitude, longitude }: Coordinates): vec3 {
  const lat = latitude / DEGREES, lon = longitude / DEGREES;
  return vec3.fromValues(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
}

export function centerCoordinates(rotation: quat): Coordinates {
  const [x, y, z] = vec3.transformQuat(vec3.create(), [0, 0, 1], quat.conjugate(quat.create(), rotation));
  return { latitude: Math.atan2(y, Math.hypot(x, z)) * DEGREES, longitude: Math.atan2(x, z) * DEGREES };
}

export function validCoordinates({ latitude, longitude }: Coordinates): boolean {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

const normalize = (value: string) => value.trim().replaceAll('−', '-');
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseCoordinates(value: string): { point: Coordinates } | { error: 'format' | 'latitude' | 'longitude' } {
  const parts = value.split(',').map(normalize);
  if (parts.length !== 2 || !parts.every(part => DECIMAL.test(part))) return { error: 'format' };
  const [latitude, longitude] = parts.map(Number);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return { error: 'latitude' };
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return { error: 'longitude' };
  return { point: { latitude, longitude } };
}

export function formatCoordinates({ latitude, longitude }: Coordinates): string {
  const lat = Math.abs(latitude) < 0.00005 ? 0 : latitude;
  const lon = Math.abs(longitude) < 0.00005 ? 0 : longitude;
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
}
