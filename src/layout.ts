import { MAX_X, MAX_Y } from './projection';

export const GLOBE_RADIUS_RATIO = 0.46;

// CSS-pixel layout of the large map; zoom does not move its center.
export function mapLayout(width: number, height: number) {
  const scale = Math.min(width * 0.875 / (2 * MAX_X), height * 0.78 / (2 * MAX_Y));
  return { x: width / 2, y: height / 2, scale };
}
