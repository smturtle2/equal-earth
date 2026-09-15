import { test, expect, type Page } from '@playwright/test';
import { mat4, quat, vec3 } from 'gl-matrix';
import { Attitude } from '../../src/attitude';
import { invert } from '../../src/projection';
import { mapLayout } from '../../src/layout';

// A known lon/lat raster lets us verify geographic lookup, source seam wrapping,
// linear-light filtering and rotation against GPU readback, independent of JPEGs.
const TW = 128, TH = 64;
function texel(x: number, y: number): number[] {
  x = ((x % TW) + TW) % TW;
  y = Math.max(0, Math.min(TH - 1, y));
  return [20 + Math.floor(x / 8) * 12, 20 + Math.floor(y / 8) * 28, (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 170 : 30];
}
function fixtureRaster(): Buffer {
  const bytes = Buffer.alloc(54 + TW * TH * 3);
  bytes.write('BM'); bytes.writeUInt32LE(bytes.length, 2); bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14); bytes.writeInt32LE(TW, 18); bytes.writeInt32LE(-TH, 22);
  bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(24, 28);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const rgb = texel(x, y);
    for (let c = 0; c < 3; c++) bytes[54 + (y * TW + x) * 3 + c] = rgb[2-c];
  }
  return bytes;
}
const decode = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const encode = (v: number) => v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055;

function sampleRaster(direction: vec3): number[] {
  const u = (Math.atan2(direction[0], direction[2]) / (2 * Math.PI) + .5) * TW - .5;
  const v = (.5 - Math.asin(Math.max(-1, Math.min(1, direction[1]))) / Math.PI) * TH - .5;
  const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
  const color = [0, 0, 0];
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weight = (dx ? fx : 1-fx) * (dy ? fy : 1-fy);
    const rgb = texel(ix + dx, iy + dy);
    for (let c = 0; c < 3; c++) color[c] += decode(rgb[c] / 255) * weight;
  }
  return color;
}

function referencePixel(x: number, y: number, width: number, height: number, attitude: Attitude): number[] {
  const inverse = quat.conjugate(quat.create(), attitude.rotation);
  const layout = mapLayout(width, height);
  const scale = layout.scale * attitude.zoom;
  const result = [0, 0, 0];
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const point = invert((x + (sx + 0.5) / 4 - layout.x) / scale, (layout.y - y - (sy + 0.5) / 4) / scale);
    let color = [1, 1, 1];
    if (point) {
      const [lon, lat] = point;
      const direction = vec3.transformQuat(vec3.create(), [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], inverse);
      vec3.normalize(direction, direction);
      color = sampleRaster(direction);
    }
    for (let i = 0; i < 3; i++) result[i] += color[i] / 16;
  }
  return result.map(v => Math.round(encode(v) * 255));
}

function referenceGlobe(x: number, y: number, width: number, height: number, attitude: Attitude): number[] {
  const inverse = quat.conjugate(quat.create(), attitude.rotation);
  const radius = Math.min(width, height) * .46;
  const color = [0, 0, 0];
  let coverage = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const dx = (x + (sx + .5) / 4 - width / 2) / radius;
    const dy = (height / 2 - y - (sy + .5) / 4) / radius;
    const depthSquared = 1 - dx*dx - dy*dy;
    if (depthSquared >= 0) {
      const direction = vec3.transformQuat(vec3.create(), [dx, dy, Math.sqrt(depthSquared)], inverse);
      const sample = sampleRaster(vec3.normalize(direction, direction));
      for (let c = 0; c < 3; c++) color[c] += sample[c];
      coverage++;
    }
  }
  return coverage ? color.map(v => Math.round(encode(v / coverage) * coverage / 16 * 255)) : color;
}

async function installReadback(page: Page) {
  await page.addInitScript(() => {
    const stats = { submits: 0, contexts: [] as string[], rotation: [] as number[], rendered: { texture: '', layer: '' } };
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (...args) {
      stats.submits++;
      stats.rendered = {
        texture: document.getElementById('map')!.dataset.texture!,
        layer: document.getElementById('globe')!.dataset.layer!,
      };
      return submit.apply(this, args);
    };
    const writeBuffer = GPUQueue.prototype.writeBuffer;
    GPUQueue.prototype.writeBuffer = function (...args) {
      const data = args[2];
      if (data instanceof Float32Array && data.length === 20) stats.rotation = Array.from(data.slice(0, 16));
      return writeBuffer.apply(this, args);
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      stats.contexts.push(`${this.id}:${kind}`);
      return getContext.call(this, kind as 'webgpu', ...args);
    } as typeof getContext;

    // This headless Chromium cannot present WebGPU swapchain images. Render into
    // a real GPU texture and read pixels back; the app's shader/pipeline is intact.
    // Onscreen presentation is verified separately in regular Chrome.
    const surfaces = new Map<GPUCanvasContext['canvas'], { device: GPUDevice; format: GPUTextureFormat; texture?: GPUTexture }>();
    GPUCanvasContext.prototype.configure = function (config) {
      surfaces.set(this.canvas, { device: config.device, format: config.format });
    };
    GPUCanvasContext.prototype.getCurrentTexture = function () {
      const surface = surfaces.get(this.canvas)!;
      const { device, format } = surface;
      let { texture } = surface;
      if (!texture || texture.width !== this.canvas.width || texture.height !== this.canvas.height) {
        texture?.destroy();
        texture = device.createTexture({ size: [this.canvas.width, this.canvas.height], format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        surface.texture = texture;
      }
      return texture;
    };
    Object.assign(window, { mapTestStats: stats, readMap: async (id = 'map') => {
      const { device, format, texture } = surfaces.get(document.getElementById(id) as HTMLCanvasElement)! as { device: GPUDevice; format: GPUTextureFormat; texture: GPUTexture };
      const rowBytes = Math.ceil(texture.width * 4 / 256) * 256;
      const buffer = device.createBuffer({ size: rowBytes * texture.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: rowBytes }, [texture.width, texture.height]);
      submit.call(device.queue, [encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(buffer.getMappedRange());
      const probes: { x: number; y: number; rgb: number[] }[] = [];
      for (const u of [0.05, 0.25, 0.5, 0.75, 0.95]) for (const v of [0.03, 0.031, 0.033, 0.15, 0.3, 0.5, 0.7, 0.705, 0.71, 0.75]) {
        const x = Math.floor(u * texture.width), y = Math.floor(v * texture.height);
        const i = y * rowBytes + x * 4;
        const rgb = Array.from(bytes.slice(i, i + 3));
        if (format.startsWith('bgra')) rgb.reverse();
        probes.push({ x, y, rgb });
      }
      let hash = 2166136261;
      let land = 0;
      let ocean = 0;
      let white = 0;
      for (let y = 0; y < texture.height; y++) for (let x = 0; x < texture.width; x++) {
        const i = y * rowBytes + x * 4;
        const sum = bytes[i] + bytes[i + 1] + bytes[i + 2];
        if (sum < 400) land++;
        else if (sum < 750) ocean++;
        else white++;
        hash = Math.imul(hash ^ sum, 16777619);
      }
      buffer.unmap();
      buffer.destroy();
      return { hash, land, ocean, white, width: texture.width, height: texture.height, probes };
    } });
  });
}

async function waitForPose(page: Page, attitude: Attitude) {
  const inverse = quat.conjugate(quat.create(), attitude.rotation);
  const expected = Array.from(mat4.fromQuat(mat4.create(), inverse));
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    mapTestStats: { rotation: number[] }
  }).mapTestStats.rotation)).toEqual(expected);
}

// Texture loading finishes before requestAnimationFrame submits the new image.
// Readback must wait for that submission; a fixed delay depends on runner speed.
async function waitForRender(page: Page, texture: string, layer = 'graticule') {
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    mapTestStats: { rendered: { texture: string; layer: string } }
  }).mapTestStats.rendered)).toEqual({ texture, layer });
}

test('maps a known raster accurately through rotation, handles input and idles', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/textures/*.jpg', route => route.fulfill({ contentType: 'image/bmp', body: fixtureRaster() }));
  await installReadback(page);
  await page.goto('/');
  const canvas = page.locator('#map');
  await expect(canvas).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#message')).toBeHidden();
  await expect(page.getByRole('button', { name: '지구본 레이어', exact: true })).toBeVisible();
  const stats = () => page.evaluate(() => (window as unknown as { mapTestStats: { submits: number; contexts: string[] } }).mapTestStats);
  const pixels = () => page.evaluate(() => (window as unknown as {
    readMap: () => Promise<{ hash: number; land: number; ocean: number; white: number; width: number; height: number; probes: { x: number; y: number; rgb: number[] }[] }>
  }).readMap());
  await page.waitForTimeout(100);
  const initial = await pixels();
  const checkReference = (snapshot: typeof initial, attitude: Attitude) => {
    for (const probe of snapshot.probes) {
      const expected = referencePixel(probe.x, probe.y, snapshot.width, snapshot.height, attitude);
      for (let c = 0; c < 3; c++) expect(Math.abs(probe.rgb[c] - expected[c]), `pixel ${probe.x},${probe.y}, channel ${c}`).toBeLessThanOrEqual(2);
    }
  };
  checkReference(initial, new Attitude());
  expect(initial.land).toBeGreaterThan(10_000);
  expect(initial.ocean).toBeGreaterThan(1000);
  expect(initial.white).toBeGreaterThan(10_000);
  const idle = (await stats()).submits;
  await page.waitForTimeout(300);
  expect((await stats()).submits).toBe(idle);

  // One keydown must generate continuous frames; no OS key-repeat events are sent.
  await canvas.focus();
  await page.keyboard.down('q');
  await expect.poll(async () => (await stats()).submits).toBeGreaterThan(idle + 3);
  await page.keyboard.up('q');
  await page.waitForTimeout(200);
  expect((await pixels()).hash).not.toBe(initial.hash);
  const released = (await stats()).submits;
  await page.waitForTimeout(200);
  expect((await stats()).submits).toBe(released);

  await page.keyboard.down('e');
  await expect.poll(async () => (await stats()).submits).toBeGreaterThan(released + 2);
  await canvas.evaluate(element => (element as HTMLCanvasElement).blur());
  await page.keyboard.up('e');
  await page.waitForTimeout(150);
  const blurred = (await stats()).submits;
  await page.waitForTimeout(200);
  expect((await stats()).submits).toBe(blurred);
  await canvas.press('0');

  for (let i = 0; i < 5; i++) {
    await page.mouse.move(550, 250);
    await page.mouse.down();
    await page.mouse.move(800, 600, { steps: 12 });
    await page.mouse.up();
  }
  const rotated = await pixels();
  expect(rotated.hash).not.toBe(initial.hash);
  await canvas.press('q');
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(150);
  const zoomed = await pixels();
  expect(zoomed.hash).not.toBe(rotated.hash);
  expect(zoomed.white).toBeLessThan(rotated.white);
  await canvas.press('0');
  await page.waitForTimeout(100);
  expect((await pixels()).hash).toBe(initial.hash);

  const turned = new Attitude();
  for (let i = 0; i < 10; i++) {
    await canvas.press('Shift+ArrowDown');
    turned.rotate([1, 0, 0], 0.15);
  }
  await waitForPose(page, turned);
  checkReference(await pixels(), turned);
  await canvas.press('0');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobile = await pixels();
  expect(mobile.width).toBe(390);
  expect(mobile.height).toBe(844);
  expect(mobile.land).toBeGreaterThan(1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 400, id: 0 }, { x: 240, y: 400, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { x: 150 - 5 * i, y: 400 - 4 * i, id: 0 }, { x: 240 + 5 * i, y: 400 + 4 * i, id: 1 },
    ] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  const touched = await pixels();
  expect(touched.hash).not.toBe(mobile.hash);
  expect(touched.white).toBeLessThan(mobile.white);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect((await stats()).contexts).toEqual(['map:webgpu', 'globe:webgpu']);
  expect(requests.filter(url => url.includes('/textures/')).map(url => new URL(url).pathname))
    .toEqual(['/textures/natural-earth.jpg']);
  expect(errors).toEqual([]);
});

test('loads both real textures, preserves the view, and recovers from failed or superseded switches', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await installReadback(page);
  await page.goto('/');
  const canvas = page.locator('#map');
  const selector = page.getByRole('group', { name: '지도 텍스처', exact: true });
  const texture = page.locator('#texture');
  const menu = page.locator('#texture-menu');
  const choose = async (id: string) => {
    await texture.click();
    await menu.locator(`button[data-texture="${id}"]`).click();
    await expect(menu).toBeHidden();
  };
  await expect(canvas).toHaveAttribute('data-state', 'ready');
  await texture.click();
  await expect(menu).toBeVisible();
  await texture.click();
  await expect(menu).toBeHidden();
  await expect(texture).toHaveAttribute('aria-expanded', 'false');
  await texture.click();
  await expect(menu).toBeVisible();
  await canvas.click({ position: { x: 5, y: 5 } });
  await expect(menu).toBeHidden();
  await texture.focus();
  await texture.press('ArrowDown');
  await expect(menu).toBeVisible();
  await expect(menu.locator('button[data-texture="natural-earth"]')).toBeFocused();
  await expect(menu.locator('button[data-texture="natural-earth"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(texture).toBeFocused();
  await expect(canvas).toHaveAttribute('data-state', 'ready');
  await expect(canvas).toHaveAttribute('data-texture', 'natural-earth');
  await expect(selector).toHaveAttribute('aria-busy', 'false');
  await expect(texture).toHaveAttribute('aria-label', '지도 텍스처');
  await expect(texture).toHaveAttribute('aria-haspopup', 'menu');
  await expect(texture).toHaveAttribute('aria-expanded', 'false');
  const pixels = (id = 'map') => page.evaluate(id => (window as unknown as {
    readMap: (id: string) => Promise<{ hash: number; white: number }>
  }).readMap(id), id);
  await canvas.press('Shift+ArrowDown');
  await canvas.press('+');
  const settled = new Attitude();
  settled.rotate([1, 0, 0], .15);
  await waitForPose(page, settled);
  const original = await pixels();
  const grid = await pixels('globe');
  await choose('blue-marble');
  await expect(canvas).toHaveAttribute('data-texture', 'blue-marble');
  await waitForRender(page, 'blue-marble');
  const nasa = await pixels();
  expect(nasa.hash).not.toBe(original.hash);
  expect((await pixels('globe')).hash).toBe(grid.hash);
  await choose('natural-earth');
  await expect(canvas).toHaveAttribute('data-texture', 'natural-earth');
  await waitForRender(page, 'natural-earth');
  expect((await pixels()).hash).toBe(original.hash);

  await page.route('**/textures/blue-marble.jpg', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await choose('blue-marble');
  await expect(page.locator('#texture-status')).toContainText('불러오지 못했습니다');
  await expect(menu.locator('[data-texture="natural-earth"]')).toHaveAttribute('aria-checked', 'true');
  await expect(texture).toContainText('Natural Earth II');
  expect((await pixels()).hash).toBe(original.hash);
  await page.unroute('**/textures/blue-marble.jpg');

  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/textures/blue-marble.jpg', async route => {
    started();
    await held;
    await route.continue().catch(() => {}); // The superseded request may already be aborted.
  });
  const controlBounds = await selector.boundingBox();
  await choose('blue-marble');
  await requested;
  await expect(selector).toHaveAttribute('aria-busy', 'true');
  expect(await selector.boundingBox()).toEqual(controlBounds);
  await choose('natural-earth');
  await expect(selector).toHaveAttribute('aria-busy', 'false');
  expect(await selector.boundingBox()).toEqual(controlBounds);
  release();
  await page.waitForTimeout(150);
  await expect(canvas).toHaveAttribute('data-texture', 'natural-earth');
  expect((await pixels()).hash).toBe(original.hash);
  await page.unroute('**/textures/blue-marble.jpg');
  await choose('blue-marble');
  await expect(canvas).toHaveAttribute('data-texture', 'blue-marble');
  await expect(page.locator('#texture-status')).toBeEmpty();
  await waitForRender(page, 'blue-marble');
  expect((await pixels()).hash).toBe(nasa.hash);
  await page.getByRole('button', { name: '지구본 레이어', exact: true }).click();
  await waitForRender(page, 'blue-marble', 'map');
  const nasaGlobe = await pixels('globe');
  expect(nasaGlobe.hash).not.toBe(grid.hash);
  await choose('natural-earth');
  await expect(canvas).toHaveAttribute('data-texture', 'natural-earth');
  await waitForRender(page, 'natural-earth', 'map');
  expect((await pixels('globe')).hash).not.toBe(nasaGlobe.hash);
  await choose('blue-marble');
  await expect(canvas).toHaveAttribute('data-texture', 'blue-marble');
  await waitForRender(page, 'blue-marble', 'map');
  expect((await pixels('globe')).hash).toBe(nasaGlobe.hash);
  expect(errors).toEqual([]);
});

test('synchronizes both projections, keeps globe size fixed, and exposes independent accessible layers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/textures/*.jpg', route => route.fulfill({ contentType: 'image/bmp', body: fixtureRaster() }));
  await installReadback(page);
  await page.goto('/');
  const map = page.locator('#map'), globe = page.locator('#globe');
  const layers = page.getByRole('button', { name: '지구본 레이어', exact: true });
  await expect(globe).toHaveAttribute('data-state', 'ready');
  await expect(globe).toHaveAttribute('data-layer', 'graticule');
  const pixels = (id: string) => page.evaluate(id => (window as unknown as {
    readMap: (id: string) => Promise<{ hash: number; width: number; height: number; probes: { x: number; y: number; rgb: number[] }[] }>
  }).readMap(id), id);
  const initialMap = await pixels('map'), initialGrid = await pixels('globe');
  await layers.click();
  await expect(layers).toBeFocused();
  await expect(layers).toHaveAttribute('aria-pressed', 'true');
  await expect(globe).toHaveAttribute('data-layer', 'map');
  await page.waitForTimeout(100);
  expect((await pixels('map')).hash).toBe(initialMap.hash);
  expect((await pixels('globe')).hash).not.toBe(initialGrid.hash);

  const check = async (attitude: Attitude) => {
    await waitForPose(page, attitude);
    for (const id of ['map', 'globe']) {
      const snapshot = await pixels(id);
      for (const p of snapshot.probes) {
        const reference = id === 'map' ? referencePixel : referenceGlobe;
        const rgb = reference(p.x, p.y, snapshot.width, snapshot.height, attitude);
        for (let c = 0; c < 3; c++) expect(Math.abs(p.rgb[c] - rgb[c]), `${id}: ${p.x},${p.y},${c}`).toBeLessThanOrEqual(2);
      }
    }
  };
  const attitude = new Attitude();
  await check(attitude);
  await globe.press('Shift+ArrowDown'); attitude.rotate([1, 0, 0], .15);
  await globe.press('Shift+ArrowRight'); attitude.rotate([0, 1, 0], .15);
  await page.waitForTimeout(150);
  await check(attitude);

  const beforeDragMap = await pixels('map'), beforeDragGlobe = await pixels('globe');
  const box = (await globe.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .35, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const draggedMap = await pixels('map'), draggedGlobe = await pixels('globe');
  expect(draggedMap.hash).not.toBe(beforeDragMap.hash);
  expect(draggedGlobe.hash).not.toBe(beforeDragGlobe.hash);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(100);
  expect((await pixels('map')).hash).toBe(draggedMap.hash);
  expect((await pixels('globe')).hash).toBe(draggedGlobe.hash);
  await map.press('+');
  await page.waitForTimeout(100);
  expect((await pixels('map')).hash).not.toBe(draggedMap.hash);
  expect((await pixels('globe')).hash).toBe(draggedGlobe.hash);

  await globe.press('0');
  await page.waitForTimeout(100);
  await check(new Attitude());
  await expect(globe).toHaveAttribute('data-layer', 'map');
  await layers.click();
  await expect(layers).toHaveAttribute('aria-pressed', 'false');
  await expect(globe).toHaveAttribute('data-layer', 'graticule');
  await page.waitForTimeout(100);
  expect((await pixels('globe')).hash).toBe(initialGrid.hash);

  await page.setViewportSize({ width: 390, height: 844 });
  await layers.click();
  await expect(globe).toHaveAttribute('data-layer', 'map');
  const toggle = (await layers.boundingBox())!;
  const panel = (await page.locator('#globe-panel').boundingBox())!;
  const selector = (await page.locator('#texture-control').boundingBox())!;
  expect(toggle.x).toBeGreaterThanOrEqual(0);
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(390);
  expect(panel.y + panel.height).toBeLessThan(selector.y);
  for (const surface of [map, globe]) {
    await surface.focus();
    await expect(surface).toHaveCSS('outline-style', 'none');
    await expect(surface).toHaveCSS('box-shadow', 'none');
  }
  expect(errors).toEqual([]);
});

test('reports unavailable WebGPU without creating a fallback renderer', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  await page.goto('/');
  await expect(page.locator('#map')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#message')).toContainText('WebGPU');
});
