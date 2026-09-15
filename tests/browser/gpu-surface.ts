import type { Page } from '@playwright/test';

export type TestSurface = { device: GPUDevice; format: GPUTextureFormat; texture?: GPUTexture };

export async function installGpuSurfaces(page: Page) {
  await page.addInitScript(() => {
    // Headless Chromium cannot present WebGPU swapchain images here. Keep the
    // real shader and device, replacing only the canvas presentation surface.
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
    Object.assign(window, { gpuTestSurface: (id: string) => surfaces.get(document.getElementById(id) as HTMLCanvasElement)! });
  });
}
