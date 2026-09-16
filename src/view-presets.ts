import { quat } from 'gl-matrix';
import { Attitude } from './attitude';
import { centerCoordinates } from './coordinates';

// Representative centers, with each continent's hemisphere pole vertically up.
// At either pole, the 0° meridian points up and the 180° meridian points down.
const compositions = [
  ['asia', 40, 95, 0],
  ['europe', 52, 15, 0],
  ['africa', 3, 20, 0],
  ['northAmerica', 45, -105, 0],
  ['southAmerica', -20, -60, 180],
  ['oceania', -22, 140, 180],
  ['northPole', 90, 0, 180],
  ['southPole', -90, 0, 0],
] as const;

const regionalPresets = compositions.map(([id, latitude, longitude, roll]) => {
  const radians = Math.PI / 180;
  const rotation = quat.create();
  quat.rotateZ(rotation, rotation, roll * radians);
  quat.rotateX(rotation, rotation, latitude * radians);
  quat.rotateY(rotation, rotation, -longitude * radians);
  return { id, latitude, longitude, roll, rotation };
});

// Use the same orientation as startup and reset, including its original roll.
const defaultRotation = new Attitude().rotation;
export const viewPresets = [
  { id: 'default' as const, ...centerCoordinates(defaultRotation), rotation: defaultRotation },
  ...regionalPresets,
];

export type ViewPreset = typeof viewPresets[number];
