import { text } from './i18n';
import { createViewUniform, type SurfaceStyle } from './view-uniform';
import type { Attitude } from './attitude';
import { GLOBE_RADIUS_RATIO } from './layout';
import earth from './earth.wgsl?raw';
import fullscreen from './fullscreen.wgsl?raw';
import globe from './globe.wgsl?raw';

export type GlobeLayer = 'graticule' | 'map';

// A second view on the same device and texture, with its own projection and layer.
export async function createGlobeRenderer(device: GPUDevice, canvas: HTMLCanvasElement, format: GPUTextureFormat, sampler: GPUSampler) {
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error(text.globeSurface);
  context.configure({ device, format, alphaMode: 'premultiplied' });
  const module = device.createShaderModule({ code: fullscreen + earth + globe });
  const pipeline = await device.createRenderPipelineAsync({ label: 'synchronized globe', layout: 'auto',
    vertex: { module, entryPoint: 'vertexMain' }, fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'triangle-list' } });
  const uniform = createViewUniform(device);
  let boundTexture: GPUTexture | undefined;
  let boundBorders: GPUTexture | undefined;
  let bindings: GPUBindGroup;
  return {
    draw(commands: GPUCommandEncoder, attitude: Attitude, texture: GPUTexture, borders: GPUTexture,
      layer: GlobeLayer, style: SurfaceStyle) {
      const ratio = Math.min(devicePixelRatio || 1, device.limits.maxTextureDimension2D / Math.max(canvas.clientWidth, canvas.clientHeight, 1));
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        // Transparent corners also pass pointer input through to the main map.
        canvas.style.clipPath = `circle(${Math.min(canvas.clientWidth, canvas.clientHeight) * GLOBE_RADIUS_RATIO}px at center)`;
      }
      if (boundTexture !== texture || boundBorders !== borders) {
        bindings = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: uniform.buffer } },
          { binding: 3, resource: texture.createView() },
          { binding: 4, resource: sampler },
          { binding: 5, resource: borders.createView() },
        ] });
        boundTexture = texture;
        boundBorders = borders;
      }
      uniform.write(attitude.rotation,
        [width / 2, height / 2, Math.min(width, height) * GLOBE_RADIUS_RATIO, layer === 'map' ? 1 : 0], style);
      const pass = commands.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.draw(3);
      pass.end();
    },
    destroy() { uniform.destroy(); context.unconfigure(); },
  };
}
