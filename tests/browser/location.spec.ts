import { test, expect, type Page } from '@playwright/test';
import { installGpuSurfaces } from './gpu-surface';

test.use({ locale: 'en-US', viewport: { width: 640, height: 480 } });

type LocationProbe = { calls: number; map: number[]; globe: number[];
  pending: { success: PositionCallback; error: PositionErrorCallback }[] };
declare global { interface Window { locationProbe: LocationProbe } }

async function prepare(page: Page, deferred = false) {
  await installGpuSurfaces(page);
  await page.addInitScript((deferred) => {
    const probe: LocationProbe = window.locationProbe = { calls: 0, map: [], globe: [], pending: [] };
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      ++probe.calls;
      if (deferred) probe.pending.push({ success, error: error! });
      else original(success, error, options);
    };
    const write = GPUQueue.prototype.writeBuffer;
    GPUQueue.prototype.writeBuffer = function (...args) {
      const data = args[2];
      if (data instanceof Float32Array && data.length === 20) {
        probe[data[16] === document.querySelector('canvas')!.width / 2 ? 'map' : 'globe'] = Array.from(data);
      }
      return write.apply(this, args);
    };
  }, deferred);
  await page.goto('/');
  await expect(page.locator('#map')).toHaveAttribute('data-state', 'ready');
}

test('requests location only on click, centers both rendered views and keeps zoom', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.5665, longitude: 126.978, accuracy: 1000 });
  await prepare(page);
  expect(await page.evaluate(() => window.locationProbe.calls)).toBe(0);
  const initialScale = await page.evaluate(() => window.locationProbe.map[18]);
  await page.locator('#map').press('+');
  await expect.poll(() => page.evaluate(() => window.locationProbe.map[18])).toBeCloseTo(initialScale * 1.12, 4);
  const before = await page.evaluate(() => window.locationProbe.map);
  await page.getByRole('button', { name: 'Center on my location', exact: true }).click();
  await expect(page.locator('#location-status')).toHaveText('Centered on your location.');
  const { map, globe, calls } = await page.evaluate(() => window.locationProbe);
  expect(calls).toBe(1);
  // Inverse rotation maps screen-forward to the geographic center.
  for (const matrix of [map, globe]) {
    expect(Math.asin(matrix[9]) * 180 / Math.PI).toBeCloseTo(37.5665, 3);
    expect(Math.atan2(matrix[8], matrix[10]) * 180 / Math.PI).toBeCloseTo(126.978, 3);
  }
  expect(map.slice(0, 16)).toEqual(globe.slice(0, 16));
  expect(map[18]).toBe(before[18]);
  await expect(page.locator('#location-marker')).toBeVisible();
  await expect(page.locator('#locate')).toBeEnabled();
  await page.locator('#map').press('ArrowRight');
  await expect(page.locator('#location-marker')).toBeHidden();
});

test('handles permission failures, retries, and discards canceled or superseded location replies', async ({ page }) => {
  await prepare(page, true);
  const button = page.locator('#locate');
  const status = page.locator('#location-status');
  for (const [code, message] of [
    [1, 'Location permission was denied. Allow location in your browser, then retry.'],
    [2, 'Your location is unavailable.'],
    [3, 'Location request timed out. Please retry.'],
  ] as const) {
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button.locator('.loading-dots')).toBeVisible();
    await page.evaluate(code => window.locationProbe.pending.at(-1)!.error({ code } as GeolocationPositionError), code);
    await expect(status).toHaveText(message);
    await expect(button).toBeEnabled();
  }
  await button.click();
  // A browser permission prompt may blur the window; it must not cancel lookup.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(button).toBeDisabled();
  await expect(status).toHaveText('Locating…');
  // Direct manipulation of either surface cancels pending automatic movement.
  await page.locator('#globe').press('ArrowLeft');
  await expect(button).toBeEnabled();
  await expect(status).toBeEmpty();
  await button.click();
  await page.evaluate(() => window.locationProbe.pending.at(-2)!.success({
    coords: { latitude: -33, longitude: 151 },
  } as GeolocationPosition));
  await expect(status).toHaveText('Locating…');
  await expect(button).toBeDisabled();
  await page.evaluate(() => window.locationProbe.pending.at(-1)!.success({
    coords: { latitude: 37.5665, longitude: 126.978 },
  } as GeolocationPosition));
  await expect(status).toHaveText('Centered on your location.');
  await expect(button).toBeEnabled();

  await button.click();
  await page.locator('#map').press('+');
  const pose = await page.evaluate(() => window.locationProbe.map);
  await page.evaluate(() => window.locationProbe.pending.at(-1)!.success({
    coords: { latitude: 0, longitude: 0 },
  } as GeolocationPosition));
  await expect(status).toBeEmpty();
  expect((await page.evaluate(() => window.locationProbe.map)).slice(0, 16)).toEqual(pose.slice(0, 16));
  await expect(page.locator('#location-marker')).toBeHidden();

  await page.evaluate(() => Object.defineProperty(navigator, 'geolocation', { value: undefined }));
  await button.click();
  await expect(status).toHaveText('Location is not supported by this browser.');
  await expect(button).toBeEnabled();
});
