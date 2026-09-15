import { text } from './i18n';
import { quat } from 'gl-matrix';
import type { Attitude } from './attitude';
import { createMapFrame, createMapPipeline, frameLayout } from './map-frame';
import { exportMapPNG, EXPORT_LONG_EDGE } from './map-export';
import presentation from './present.wgsl?raw';
import fullscreen from './fullscreen.wgsl?raw';
import { loadTexture, type TextureId } from './textures';
import { createGlobeRenderer, type GlobeLayer } from './globe-renderer';

export async function createRenderer(canvas: HTMLCanvasElement, globeCanvas: HTMLCanvasElement, onFailure: (message: string) => void) {
  if (!navigator.gpu) throw new Error(text.webgpu);
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error(text.adapter);
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) { device.destroy(); throw new Error(text.mapSurface); }

  device.addEventListener('uncapturederror', (event) => {
    console.error(event.error);
    onFailure(text.drawFailed);
  });
  void device.lost.then((info) => {
    if (info.reason !== 'destroyed') onFailure(text.deviceLost);
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
    createMapPipeline(device),
  ]);
  let bindings: GPUBindGroup;
  let presentedFrame: GPUTexture | undefined;
  let disposed = false;
  let earthTexture: GPUTexture | undefined;
  let loading: AbortController | undefined;
  const sampler = device.createSampler({ addressModeU: 'repeat', addressModeV: 'clamp-to-edge',
    magFilter: 'linear', minFilter: 'linear' });
  const map = createMapFrame(device, computePipeline, sampler);
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
      const layout = frameLayout(cssWidth, cssHeight, ratio, attitude.zoom);
      if (canvas.width !== layout.width) canvas.width = layout.width;
      if (canvas.height !== layout.height) canvas.height = layout.height;
      const commands = device.createCommandEncoder();
      const frame = map.encode(commands, earthTexture, layout, attitude.rotation);
      if (frame !== presentedFrame) {
        bindings = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: frame.createView() },
        ] });
        presentedFrame = frame;
      }
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
    async exportPNG(attitude: Attitude) {
      if (disposed || !earthTexture) throw new Error(text.exportFailed);
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const layout = frameLayout(width, height, EXPORT_LONG_EDGE / Math.max(width, height), attitude.zoom);
      const blob = await exportMapPNG(device, computePipeline, sampler, earthTexture, layout, quat.clone(attitude.rotation));
      return { blob, width: layout.width, height: layout.height };
    },
    destroy() {
      disposed = true;
      loading?.abort();
      earthTexture?.destroy();
      map.destroy();
      globe.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
