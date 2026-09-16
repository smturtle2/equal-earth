import { mat4, quat } from 'gl-matrix';
import { createRows } from './projection';
import { mapLayout } from './layout';
import shader from './map.wgsl?raw';
import earth from './earth.wgsl?raw';

const SAMPLE_GRID = 4;

export function frameLayout(cssWidth: number, cssHeight: number, ratio: number, zoom: number) {
  const layout = mapLayout(cssWidth, cssHeight);
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
    x: layout.x * ratio, y: layout.y * ratio, scale: layout.scale * ratio * zoom,
  };
}
export type FrameLayout = ReturnType<typeof frameLayout>;

// The same projection and sampling pipeline serves the display and PNG export.
export function createMapPipeline(device: GPUDevice) {
  return device.createComputePipelineAsync({
    label: 'earth texture integration', layout: 'auto',
    compute: { module: device.createShaderModule({ code: earth + '\n' + shader }),
      entryPoint: 'computeMain', constants: { SAMPLE_GRID } },
  });
}

// Each target owns its buffers so an export cannot resize or overwrite the live view.
export function createMapFrame(device: GPUDevice, pipeline: GPUComputePipeline, sampler: GPUSampler, background: 'white' | 'transparent' = 'white') {
  const uniform = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const values = new Float32Array(24);
  const inverse = quat.create();
  const matrix = mat4.create();
  let rows: GPUBuffer | undefined;
  let frame: GPUTexture | undefined;
  let bindings: GPUBindGroup;
  let lastShape = '';
  let lastTexture: GPUTexture | undefined;
  let lastBorders: GPUTexture | undefined;

  return {
    encode(commands: GPUCommandEncoder, texture: GPUTexture, borders: GPUTexture, layout: FrameLayout,
      rotation: quat, details: readonly [boolean, boolean]): GPUTexture {
      const { width, height, x, y, scale } = layout;
      const shape = `${width}:${height}:${scale}:${y}`;
      if (shape !== lastShape || texture !== lastTexture || borders !== lastBorders) {
        const data = createRows(height, scale, SAMPLE_GRID, y);
        if (!rows || rows.size !== data.byteLength) {
          rows?.destroy();
          rows = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        }
        if (!frame || frame.width !== width || frame.height !== height) {
          frame?.destroy();
          frame = device.createTexture({ label: 'integrated map pixels', size: [width, height], format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
        }
        bindings = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: { buffer: rows } },
          { binding: 2, resource: frame.createView() },
          { binding: 3, resource: texture.createView() },
          { binding: 4, resource: sampler },
          { binding: 5, resource: borders.createView() },
        ] });
        device.queue.writeBuffer(rows, 0, data);
        lastShape = shape;
        lastTexture = texture;
        lastBorders = borders;
      }
      quat.conjugate(inverse, rotation);
      mat4.fromQuat(matrix, inverse);
      values.set(matrix);
      values.set([x, y, scale, background === 'transparent' ? 1 : 0], 16);
      values.set([Number(details[0]), Number(details[1]), 0, 0], 20);
      device.queue.writeBuffer(uniform, 0, values);
      const pass = commands.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      pass.end();
      return frame!;
    },
    destroy() {
      rows?.destroy();
      uniform.destroy();
      frame?.destroy();
    },
  };
}
