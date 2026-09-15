import { installGpuSurfaces } from './gpu-surface';
import { promises as fs } from 'node:fs';
import { test, expect } from '@playwright/test';

test.use({ locale: 'en-US' });

test('reports an export failure and retries as a 4K PNG', async ({ page }, testInfo) => {
  test.setTimeout(process.env.CI ? 180_000 : 90_000);
  await installGpuSurfaces(page);
  await page.addInitScript(() => {
    let calls = 0;
    let release!: () => void;
    const original = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (...args) {
      calls++;
      if (calls === 1) return Promise.reject(new Error('injected export failure'));
      return new Promise<void>(resolve => {
        release = resolve;
        (window as unknown as { downloadEncodingReady: boolean }).downloadEncodingReady = true;
      })
        .then(() => original.apply(this, args));
    };
    (window as unknown as { releaseDownload: () => void }).releaseDownload = () => release();
  });

  await page.goto('/');
  const map = page.locator('#map');
  const downloadButton = page.locator('#download');
  const status = page.locator('#download-status');
  await expect(map).toHaveAttribute('data-state', 'ready');
  await expect(downloadButton).toBeEnabled();

  await downloadButton.click();
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('data-error', 'true', { timeout: process.env.CI ? 90_000 : 40_000 });
  await expect(status).toHaveText('Could not save the image. Please try again.');
  await expect(downloadButton).toBeEnabled();
  await expect(downloadButton).toHaveAttribute('aria-busy', 'false');

  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  await expect(downloadButton).toBeDisabled();
  await expect(downloadButton).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#download-loading')).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { downloadEncodingReady: boolean }).downloadEncodingReady);
  await page.evaluate(() => (window as unknown as { releaseDownload: () => void }).releaseDownload());
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^equal-earth-natural-earth-4096x2594-.*\.png$/);
  const path = testInfo.outputPath('natural-earth-4k.png');
  await download.saveAs(path);
  const png = await fs.readFile(path);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  expect(png.readUInt32BE(16)).toBe(4096);
  expect(png.readUInt32BE(20)).toBe(2594);
  const opacity = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let transparent = 0, opaqueWhite = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) transparent++;
      if (pixels[i + 3] === 255 && pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245) opaqueWhite++;
    }
    bitmap.close();
    return { transparent, opaqueWhite };
  }, png.toString('base64'));
  expect(opacity.transparent).toBeGreaterThan(100_000);
  expect(opacity.opaqueWhite).toBeGreaterThan(1_000);

  await expect(status).toHaveAttribute('data-error', 'false');
  await expect(downloadButton).toBeEnabled();
  await expect(downloadButton).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#download-loading')).toBeHidden();
});
