import { expect, it } from 'vitest';
import { Attitude } from '../src/attitude';
import { centerCoordinates, formatCoordinates, parseCoordinates, validCoordinates } from '../src/coordinates';

it('parses one signed decimal pair without treating empty or malformed input as zero', () => {
  for (const [input, expected] of [['0', 0], ['−12.5', -12.5], [' +.5 ', .5], ['-90', -90], ['90.0', 90]] as const) {
    expect(parseCoordinates(`${input}, 180`)).toEqual({ point: { latitude: expected, longitude: 180 } });
  }
  for (const input of ['', ' ', '-', '.', 'NaN', 'Infinity', '1e2', '0x10', '37N', '1.2.3']) {
    expect(parseCoordinates(`${input}, 0`)).toEqual({ error: 'format' });
  }
  expect(parseCoordinates('90.0001, 0')).toEqual({ error: 'latitude' });
  expect(parseCoordinates('0, -180.00001')).toEqual({ error: 'longitude' });
  expect(parseCoordinates(' −33.8688, 151.2093 ')).toEqual({ point: { latitude: -33.8688, longitude: 151.2093 } });
  for (const input of ['37', '37,', '37,126,3', '37N,126E', '1e2,0']) expect(parseCoordinates(input)).toEqual({ error: 'format' });
  expect(validCoordinates({ latitude: -90, longitude: 180 })).toBe(true);
  expect(validCoordinates({ latitude: NaN, longitude: 0 })).toBe(false);
});

it('reads the actual rotated center and formats a stable latitude/longitude display', () => {
  for (const [latitude, longitude] of [[37.5665, 126.978], [-33.8688, 151.2093], [-12.5, -179.75], [0, 0], [90, 0], [-90, 0]]) {
    const attitude = new Attitude();
    attitude.rotate([0, 0, 1], 1.3);
    attitude.centerOn(latitude, longitude);
    const result = centerCoordinates(attitude.rotation);
    expect(result.latitude).toBeCloseTo(latitude, 4);
    if (Math.abs(latitude) !== 90) expect(result.longitude).toBeCloseTo(longitude, 4);
  }
  expect(formatCoordinates({ latitude: -33.8688, longitude: 151.2093 })).toBe('33.8688° S · 151.2093° E');
  expect(formatCoordinates({ latitude: -0.000001, longitude: -0 })).toBe('0.0000° N · 0.0000° E');
});
