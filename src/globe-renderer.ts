import { text } from './i18n';
import { mat4, quat } from 'gl-matrix';
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
  const uniform = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const values = new Float32Array(24), inverse = quat.create(), matrix = mat4.create();
  let boundTexture: GPUTexture | undefined;
  let boundBorders: GPUTexture | undefined;
  let bindings: GPUBindGroup;
  return {
    draw(commands: GPUCommandEncoder, attitude: Attitude, texture: GPUTexture, borders: GPUTexture,
      layer: GlobeLayer, details: readonly [boolean, boolean]) {
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
          { binding: 0, resource: { buffer: uniform } },
          { binding: 3, resource: texture.createView() },
          { binding: 4, resource: sampler },
          { binding: 5, resource: borders.createView() },
        ] });
        boundTexture = texture;
        boundBorders = borders;
      }
      mat4.fromQuat(matrix, quat.conjugate(inverse, attitude.rotation));
      values.set(matrix);
      values.set([width / 2, height / 2, Math.min(width, height) * GLOBE_RADIUS_RATIO, layer === 'map' ? 1 : 0], 16);
      values.set([Number(details[0]), Number(details[1]), 0, 0], 20);
      device.queue.writeBuffer(uniform, 0, values);
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
