// Render the shared README/social image from the app's current default view.
// Run: node tools/build_hero.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  configFile: fileURLToPath(new URL('../config/vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, strictPort: true },
  plugins: [{
    name: 'hero-render-page',
    configureServer(server) {
      server.middlewares.use('/__hero', (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Equal Earth hero renderer</title>');
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__hero`);
  const result = await page.evaluate(async () => {
    const { Attitude } = await import('/src/attitude.ts');
    const { centerCoordinates } = await import('/src/coordinates.ts');
    const { createEarthAssets } = await import('/src/earth-assets.ts');
    const { createMapPipeline, frameLayout } = await import('/src/map-frame.ts');
    const { exportMapPNG } = await import('/src/map-export.ts');
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU is required to render the hero.');
    const device = await adapter.requestDevice();
    const assets = createEarthAssets(device);
    try {
      await assets.setTexture('natural-earth');
      const surface = assets.snapshot();
      const attitude = new Attitude();
      const pipeline = await createMapPipeline(device);
      const sampler = device.createSampler({
        addressModeU: 'repeat', addressModeV: 'clamp-to-edge', magFilter: 'linear', minFilter: 'linear',
      });
      const blob = await exportMapPNG(device, pipeline, sampler, surface.texture, surface.borders,
        frameLayout(1200, 630, 1, attitude.zoom), attitude.rotation, surface.style, [], 1);
      return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), center: centerCoordinates(attitude.rotation) };
    } finally {
      assets.destroy();
      device.destroy();
    }
  });
  const image = Buffer.from(result.bytes);
  if (image.readUInt32BE(16) !== 1200 || image.readUInt32BE(20) !== 630) throw new Error('Unexpected hero size.');
  await writeFile(new URL('../public/og-image.png', import.meta.url), image);
  console.log(`og-image.png: 1200×630, center ${result.center.latitude.toFixed(4)}, ${result.center.longitude.toFixed(4)}`);
} finally {
  await browser?.close();
  await server.close();
}
