import { test, expect, type Page } from '@playwright/test';
import { installGpuSurfaces } from './gpu-surface';
import { mat4, quat } from 'gl-matrix';
import { viewPresets } from '../../src/view-presets';

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
      if (data instanceof Float32Array && data.length === 24) {
        probe[data[16] === document.querySelector('canvas')!.width / 2 ? 'map' : 'globe'] = Array.from(data);
      }
      return write.apply(this, args);
    };
  }, deferred);
  await page.goto('/');
  await expect(page.locator('#map')).toHaveAttribute('data-state', 'ready');
}

test('restores complete presets in both views, keeps zoom and supersedes pending location requests', async ({ page }) => {
  await prepare(page, true);
  const initialScale = await page.evaluate(() => window.locationProbe.map[18]);
  await page.locator('#map').press('+');
  await expect.poll(() => page.evaluate(() => window.locationProbe.map[18])).toBeCloseTo(initialScale * 1.12, 4);
  const scale = await page.evaluate(() => window.locationProbe.map[18]);
  await page.locator('#locate').click();
  for (const preset of [...viewPresets, viewPresets.find(p => p.id === 'northPole')!, viewPresets.find(p => p.id === 'southPole')!]) {
    await page.locator('#preset').click();
    const button = page.locator(`[data-preset="${preset.id}"]`);
    await button.click();
    await expect(page.locator('#preset-menu')).toBeHidden();
    await expect(page.locator('#preset')).toBeFocused();
    await expect(button).toHaveAttribute('aria-checked', 'true');
    const { map, globe } = await page.evaluate(() => window.locationProbe);
    const inverse = mat4.fromQuat(mat4.create(), quat.conjugate(quat.create(), preset.rotation));
    for (let i = 0; i < 16; i++) expect(map[i]).toBeCloseTo(inverse[i], 4);
    expect(map.slice(0, 16)).toEqual(globe.slice(0, 16));
    expect(map[18]).toBe(scale);
  }
  const pose = await page.evaluate(() => window.locationProbe.map);
  await page.evaluate(() => window.locationProbe.pending[0].success({
    coords: { latitude: 0, longitude: 0 },
  } as GeolocationPosition));
  expect((await page.evaluate(() => window.locationProbe.map)).slice(0, 16)).toEqual(pose.slice(0, 16));
  // Selecting a preset keeps focus on its control; shortcuts still rotate.
  await expect(page.locator('#preset')).toBeFocused();
  await page.keyboard.down('q');
  try {
    await expect(page.locator('#preset-menu [aria-checked=true]')).toHaveCount(0);
  } finally {
    await page.keyboard.up('q');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#preset').click();
  await page.locator('[data-preset="asia"]').click();
  await expect(page.locator('[data-preset="asia"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#locate')).toBeEnabled();
});

test('keeps shortcuts after button use, reserves editing and menu keys, and fits the preset dropdown', async ({ page }) => {
  await prepare(page, true);
  const rotation = () => page.evaluate(() => window.locationProbe.map.slice(0, 16));
  const initial = await rotation();
  await page.locator('#globe-layers-button').click();
  await expect(page.locator('#globe-layers-button')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(rotation).not.toEqual(initial);
  await page.keyboard.press('0');
  await expect.poll(rotation).toEqual(initial);

  const trigger = page.locator('#preset');
  const menu = page.locator('#preset-menu');
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(page.locator('[data-preset="default"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-preset="asia"]')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('[data-preset="default"]')).toBeFocused();
  await page.keyboard.press('q');
  await page.keyboard.press('ArrowLeft');
  expect(await rotation()).toEqual(initial);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(rotation).not.toEqual(initial);

  await page.locator('#coordinates').click();
  const input = page.locator('#coordinate-input');
  await input.fill('0, 0');
  const editingPose = await rotation();
  await input.press('End');
  await input.press('q');
  await expect(input).toHaveValue('0, 0q');
  expect(await rotation()).toEqual(editingPose);
  await input.press('Escape');

  await page.setViewportSize({ width: 320, height: 740 });
  await trigger.click();
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(304);
  expect(box.y + box.height).toBeLessThanOrEqual(724);
  await page.keyboard.press('End');
  await expect(page.locator('[data-preset="southPole"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(page.locator('#preset-label')).toHaveText('South Pole');
});

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

async function pastePair(page: Page, id: string, value: string) {
  await page.locator(`#${id}`).focus();
  await page.evaluate(({ id, value }) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', value);
    document.getElementById(id)!.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, { id, value });
}

test('edits center coordinates, validates and pastes pairs, and supersedes pending geolocation', async ({ page }) => {
  await prepare(page, true);
  const coordinates = page.getByRole('button', { name: 'Edit center coordinates', exact: true });
  const input = page.getByRole('textbox', { name: 'Latitude, longitude', exact: true });
  const form = page.locator('#coordinate-form');
  const initial = await page.evaluate(() => window.locationProbe.map);
  await coordinates.click();
  const initialValue = await input.inputValue();
  const pair = initialValue.split(',').map(Number);
  expect(pair[0]).toBeCloseTo(Math.asin(initial[9]) * 180 / Math.PI, 4);
  expect(pair[1]).toBeCloseTo(Math.atan2(initial[8], initial[10]) * 180 / Math.PI, 4);
  for (const [value, message] of [
    ['-91, 181', 'Enter a latitude from −90 to 90.'],
    ['0, 181', 'Enter a longitude from −180 to 180.'],
    ['', 'Enter latitude, longitude (e.g. 37.5665, 126.9780).'],
  ]) {
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();
    await expect(page.locator('#coordinate-error')).toHaveText(message);
  }
  await pastePair(page, 'coordinate-input', '-33.8688, 151.2093');
  await expect(input).toHaveValue('-33.8688, 151.2093');
  expect((await page.evaluate(() => window.locationProbe.map)).slice(0, 16)).toEqual(initial.slice(0, 16));
  await input.press('Escape');
  await expect(form).toBeHidden();
  await expect(coordinates).toBeFocused();

  await coordinates.click();
  await expect(input).toHaveValue(initialValue);
  await input.fill('-33.8688, 151.2093');
  await input.press('Enter');
  await expect(page.locator('#location-status')).toHaveText('Centered on coordinates.');
  await expect(form).toBeHidden();
  await expect(page.locator('#coordinate-value')).toHaveText('33.8688° S · 151.2093° E');
  const { map, globe, calls } = await page.evaluate(() => window.locationProbe);
  expect(Math.asin(map[9]) * 180 / Math.PI).toBeCloseTo(-33.8688, 3);
  expect(Math.atan2(map[8], map[10]) * 180 / Math.PI).toBeCloseTo(151.2093, 3);
  expect(map.slice(0, 16)).toEqual(globe.slice(0, 16));
  expect(map[18]).toBe(initial[18]);
  expect(calls).toBe(0);

  await page.locator('#locate').click();
  await expect(page.locator('#location-status')).toHaveText('Locating…');
  await coordinates.click();
  await input.fill('0, 0');
  await page.evaluate(() => window.locationProbe.pending.at(-1)!.success({
    coords: { latitude: 37.5665, longitude: 126.978 },
  } as GeolocationPosition));
  await expect(page.locator('#location-status')).toBeEmpty();
  await expect(input).toHaveValue('0, 0');
  expect((await page.evaluate(() => window.locationProbe.map)).slice(0, 16)).toEqual(map.slice(0, 16));
  await page.locator('#globe').press('ArrowRight');
  await expect(form).toBeHidden();
  await expect(page.locator('#coordinate-value')).not.toHaveText('33.8688° S · 151.2093° E');
});

test('fits the Korean coordinate editor and errors on a narrow touch screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', { value: ['ko-KR'] }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page, true);
  const navigation = page.locator('#navigation-controls');
  const before = (await navigation.boundingBox())!;
  const locateBefore = (await page.locator('#locate').boundingBox())!;
  await page.getByRole('button', { name: '중심 좌표 편집', exact: true }).click();
  const input = page.getByRole('textbox', { name: '위도, 경도', exact: true });
  await expect(page.locator('#coordinate-form input')).toHaveCount(1);
  await input.fill('91, 181');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.locator('#coordinate-error')).toHaveText('위도는 −90~90°로 입력해 주세요.');
  for (const id of ['navigation-controls', 'coordinate-input', 'coordinate-go', 'coordinate-cancel', 'locate', 'coordinate-error']) {
    const box = (await page.locator(`#${id}`).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(304);
  }
  const locate = (await page.locator('#locate').boundingBox())!;
  const after = (await navigation.boundingBox())!;
  expect(after.width).toBe(before.width);
  expect(after.x + after.width).toBe(304);
  expect(locate.x).toBe(locateBefore.x);
  expect(locate.y).toBe(locateBefore.y);
  await pastePair(page, 'coordinate-input', '−12.5, -179.75');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.locator('#coordinate-value')).toHaveText('12.5000° S · 179.7500° W');
  await expect(page.locator('#location-status')).toHaveText('입력한 좌표로 이동했습니다.');
  await expect(page.locator('#coordinate-form')).toBeHidden();
  expect(await page.evaluate(() => window.locationProbe.calls)).toBe(0);
});
