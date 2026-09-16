import { test, expect, type Page } from '@playwright/test';
import { installGpuSurfaces, type TestSurface } from './gpu-surface';

async function surfaceHash(page: Page, id: string) {
  return page.evaluate(async id => {
    const { device, texture } = (window as unknown as { gpuTestSurface: (id: string) => TestSurface }).gpuTestSurface(id);
    const rowBytes = Math.ceil(texture!.width * 4 / 256) * 256;
    const buffer = device.createBuffer({ size: rowBytes * texture!.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const commands = device.createCommandEncoder();
    commands.copyTextureToBuffer({ texture: texture! }, { buffer, bytesPerRow: rowBytes }, [texture!.width, texture!.height]);
    device.queue.submit([commands.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    let hash = 2166136261;
    for (const byte of new Uint8Array(buffer.getMappedRange())) hash = Math.imul(hash ^ byte, 16777619);
    buffer.unmap(); buffer.destroy();
    return hash;
  }, id);
}

test.use({ locale: 'en-US', viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' });

test('shares borders across political/satellite/globe views and exports upright names', async ({ page }) => {
  test.setTimeout(120_000);
  await installGpuSurfaces(page);
  await page.addInitScript(() => {
    const names: string[] = [];
    const fill = OffscreenCanvasRenderingContext2D.prototype.fillText;
    OffscreenCanvasRenderingContext2D.prototype.fillText = function (...args) {
      names.push(args[0]);
      return fill.apply(this, args);
    };
    Object.assign(window, { exportedNames: names });
  });
  await page.goto('/');
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-state', 'ready');
  await page.locator('#texture').click();
  await page.getByRole('menuitemradio', { name: 'Atlas', exact: true }).click();
  await expect(map).toHaveAttribute('data-texture', 'political');
  await expect(map).toHaveAttribute('data-borders', 'true');
  await expect(map).toHaveAttribute('data-labels', 'true');
  const count = () => page.locator('#map-labels').getAttribute('data-count').then(Number);
  await expect.poll(count).toBeGreaterThan(0);
  await page.locator('#globe-layers-button').click();
  const withBorders = [await surfaceHash(page, 'map'), await surfaceHash(page, 'globe')];
  await page.locator('#map-details').click();
  await expect(map).toHaveAttribute('data-borders', 'false');
  expect(await surfaceHash(page, 'map')).not.toBe(withBorders[0]);
  expect(await surfaceHash(page, 'globe')).not.toBe(withBorders[1]);
  await page.locator('#map-details').click();
  await expect(map).toHaveAttribute('data-borders', 'true');
  expect(await surfaceHash(page, 'map')).toBe(withBorders[0]);
  await page.locator('#preset').click();
  await page.locator('[data-preset="southPole"]').click();
  await expect(page.locator('[data-preset="southPole"]')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(count).toBeGreaterThan(0);
  const labelCount = await count();
  const download = page.waitForEvent('download');
  await page.locator('#download').click();
  expect((await download).suggestedFilename()).toMatch(/^equal-earth-political-4096x3072-/);
  const exportedNames = await page.evaluate(() => (window as unknown as { exportedNames: string[] }).exportedNames);
  expect(exportedNames.length).toBe(labelCount);
  expect(exportedNames.every(name => name.length > 0)).toBe(true);
  await page.locator('#map-details').click();
  await expect(map).toHaveAttribute('data-labels', 'false');
  expect(await count()).toBe(0);
  expect(await page.locator('#map-labels').evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    return element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data.some(byte => byte !== 0);
  })).toBe(false);
  await page.locator('#texture').click();
  await page.getByRole('menuitemradio', { name: 'NASA Blue Marble', exact: true }).click();
  await expect(map).toHaveAttribute('data-texture', 'blue-marble');
  await expect(page.locator('#texture')).toBeEnabled();
  await expect(map).toHaveAttribute('data-borders', 'false');
  await expect(map).toHaveAttribute('data-labels', 'false');
  await page.locator('#map-details').click();
  await expect(map).toHaveAttribute('data-borders', 'true');
  await expect(map).toHaveAttribute('data-labels', 'true');
  const satelliteBorders = await surfaceHash(page, 'map');
  await page.locator('#map-details').click();
  await expect(map).toHaveAttribute('data-borders', 'false');
  expect(await surfaceHash(page, 'map')).not.toBe(satelliteBorders);
});

test('keeps the base map usable when details fail and retries on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await installGpuSurfaces(page);
  await page.route('**/layers/labels.json', route => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.locator('#map')).toHaveAttribute('data-state', 'ready');
  const borders = page.locator('#map-details');
  await borders.click();
  await expect(page.locator('#layer-status')).toHaveText('Could not load map details. Please try again.');
  await expect(borders).toHaveAttribute('aria-pressed', 'false');
  await expect(borders).toBeEnabled();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#map')).toHaveAttribute('data-state', 'ready');
  await page.unroute('**/layers/labels.json');
  await borders.click();
  await expect(borders).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#layer-status')).toBeEmpty();
  const boxes = await Promise.all(['#texture', '#map-details', '#download'].map(id => page.locator(id).boundingBox()));
  for (const box of boxes) {
    expect(box!.x).toBeGreaterThanOrEqual(16);
    expect(box!.x + box!.width).toBeLessThanOrEqual(304);
  }
  expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x);
});
