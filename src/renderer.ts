import { mat4, quat } from 'gl-matrix';
import type { Attitude } from './attitude';
import { createRows } from './projection';
import { mapLayout } from './layout';
import shader from './map.wgsl?raw';
import earth from './earth.wgsl?raw';
import presentation from './present.wgsl?raw';
import fullscreen from './fullscreen.wgsl?raw';
import { loadTexture, type TextureId } from './textures';
import { createGlobeRenderer, type GlobeLayer } from './globe-renderer';

const SAMPLE_GRID = 4;

export async function createRenderer(canvas: HTMLCanvasElement, globeCanvas: HTMLCanvasElement, onFailure: (message: string) => void) {
  if (!navigator.gpu) throw new Error('WebGPU를 사용할 수 있는 브라우저에서 열어 주세요.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('이 환경에서 WebGPU를 사용할 수 없습니다.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) { device.destroy(); throw new Error('WebGPU 화면을 만들 수 없습니다.'); }

  device.addEventListener('uncapturederror', (event) => {
    console.error(event.error);
    onFailure('지도를 그리지 못했습니다. 새로고침해 주세요.');
  });
  void device.lost.then((info) => {
    if (info.reason !== 'destroyed') onFailure('그래픽 연결이 끊겼습니다. 새로고침해 주세요.');
  });

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const module = device.createShaderModule({ code: fullscreen + presentation });
  const [pipeline, computePipeline] = await Promise.all([
    device.createRenderPipelineAsync({
      label: 'equal earth', layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    }),
    device.createComputePipelineAsync({
      label: 'earth texture integration', layout: 'auto',
      compute: { module: device.createShaderModule({ code: earth + '\n' + shader }),
        entryPoint: 'computeMain', constants: { SAMPLE_GRID } },
    }),
  ]);
  const uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const values = new Float32Array(20);
  const inverse = quat.create();
  const matrix = mat4.create();
  let rowBuffer: GPUBuffer | undefined;
  let frame: GPUTexture | undefined;
  let bindings: GPUBindGroup;
  let computeBindings: GPUBindGroup;
  let lastShape = '';
  let disposed = false;
  let earthTexture: GPUTexture | undefined;
  let loading: AbortController | undefined;
  const sampler = device.createSampler({ addressModeU: 'repeat', addressModeV: 'clamp-to-edge',
    magFilter: 'linear', minFilter: 'linear' });
  const globe = await createGlobeRenderer(device, globeCanvas, format, sampler);
  let globeLayer: GlobeLayer = 'graticule';

  return {
    setGlobeLayer(layer: GlobeLayer) { globeLayer = layer; },
    async setTexture(id: TextureId): Promise<boolean> {
      loading?.abort();
      const request = new AbortController();
      loading = request;
      try {
        const texture = await loadTexture(device, id, request.signal);
        if (disposed || request.signal.aborted) { texture.destroy(); return false; }
        earthTexture?.destroy();
        earthTexture = texture;
        lastShape = '';
        return true;
      } catch (error) {
        if (request.signal.aborted) return false;
        throw error;
      }
    },
    draw(attitude: Attitude) {
      if (disposed || !earthTexture) return;
      // Match display resolution, within the device's dimensional limit.
      const cssWidth = Math.max(1, canvas.clientWidth);
      const cssHeight = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(devicePixelRatio || 1, device.limits.maxTextureDimension2D / Math.max(cssWidth, cssHeight));
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      const layout = mapLayout(cssWidth, cssHeight);
      const scale = layout.scale * ratio * attitude.zoom;
      const centerX = layout.x * ratio, centerY = layout.y * ratio;
      const shape = `${width}:${height}:${scale}:${centerY}`;

      if (shape !== lastShape) {
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const rows = createRows(height, scale, SAMPLE_GRID, centerY);
        if (!rowBuffer || rowBuffer.size !== rows.byteLength) {
          rowBuffer?.destroy();
          rowBuffer = device.createBuffer({ size: rows.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        }
        if (!frame || frame.width !== width || frame.height !== height) {
          frame?.destroy();
          frame = device.createTexture({ label: 'integrated pixels', size: [width, height], format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
          bindings = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
            { binding: 0, resource: frame.createView() },
          ] });
        }
        computeBindings = device.createBindGroup({ layout: computePipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: { buffer: rowBuffer } },
          { binding: 2, resource: frame.createView() },
          { binding: 3, resource: earthTexture.createView() },
          { binding: 4, resource: sampler },
        ] });
        device.queue.writeBuffer(rowBuffer, 0, rows);
        lastShape = shape;
      }

      quat.conjugate(inverse, attitude.rotation);
      mat4.fromQuat(matrix, inverse);
      values.set(matrix);
      values.set([centerX, centerY, scale, 0], 16);
      device.queue.writeBuffer(uniform, 0, values);
      const commands = device.createCommandEncoder();
      const compute = commands.beginComputePass();
      compute.setPipeline(computePipeline);
      compute.setBindGroup(0, computeBindings);
      compute.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      compute.end();
      const pass = commands.beginRenderPass({ colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: 'clear', storeOp: 'store',
      }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.draw(3);
      pass.end();
      globe.draw(commands, attitude, earthTexture, globeLayer);
      device.queue.submit([commands.finish()]);
    },
    destroy() {
      disposed = true;
      loading?.abort();
      earthTexture?.destroy();
      rowBuffer?.destroy();
      uniform.destroy();
      frame?.destroy();
      globe.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
