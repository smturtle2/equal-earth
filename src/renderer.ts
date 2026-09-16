import { text, locale } from './i18n';
import { quat } from 'gl-matrix';
import type { Attitude } from './attitude';
import { createMapFrame, createMapPipeline, frameLayout } from './map-frame';
import { exportMapPNG, EXPORT_LONG_EDGE } from './map-export';
import presentation from './present.wgsl?raw';
import fullscreen from './fullscreen.wgsl?raw';
import { createGlobeRenderer, type GlobeLayer } from './globe-renderer';
import { createEarthAssets, type MapLayers } from './earth-assets';
import { drawLabels } from './map-labels';

export async function createRenderer(canvas: HTMLCanvasElement, globeCanvas: HTMLCanvasElement,
  labelCanvas: HTMLCanvasElement, onFailure: (message: string) => void) {
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
  const assets = createEarthAssets(device);
  const labelContext = labelCanvas.getContext('2d');
  const sampler = device.createSampler({ addressModeU: 'repeat', addressModeV: 'clamp-to-edge',
    magFilter: 'linear', minFilter: 'linear' });
  const map = createMapFrame(device, computePipeline, sampler);
  const globe = await createGlobeRenderer(device, globeCanvas, format, sampler);
  let globeLayer: GlobeLayer = 'graticule';

  return {
    setGlobeLayer(layer: GlobeLayer) { globeLayer = layer; },
    async setLayers(next: MapLayers) {
      if (next.labels && !labelContext) throw new Error(text.layersFailed);
      await assets.setLayers(next);
    },
    setTexture: assets.setTexture,
    draw(attitude: Attitude) {
      const surface = assets.snapshot();
      if (!surface) return;
      // Match display resolution, within the device's dimensional limit.
      const cssWidth = Math.max(1, canvas.clientWidth);
      const cssHeight = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(devicePixelRatio || 1, device.limits.maxTextureDimension2D / Math.max(cssWidth, cssHeight));
      const layout = frameLayout(cssWidth, cssHeight, ratio, attitude.zoom);
      if (canvas.width !== layout.width) canvas.width = layout.width;
      if (canvas.height !== layout.height) canvas.height = layout.height;
      const commands = device.createCommandEncoder();
      const frame = map.encode(commands, surface.texture, surface.borders, layout, attitude.rotation, surface.style);
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
      globe.draw(commands, attitude, surface.texture, surface.borders, globeLayer, surface.style);
      device.queue.submit([commands.finish()]);
      if (labelCanvas.width !== layout.width) labelCanvas.width = layout.width;
      if (labelCanvas.height !== layout.height) labelCanvas.height = layout.height;
      labelContext?.clearRect(0, 0, layout.width, layout.height);
      const placed = surface.layers.labels && labelContext
        ? drawLabels(labelContext, surface.labels, attitude.rotation, frameLayout(cssWidth, cssHeight, 1, attitude.zoom), locale, ratio) : [];
      labelCanvas.dataset.count = String(placed.length);
      canvas.dataset.borders = String(surface.layers.borders);
      canvas.dataset.labels = String(surface.layers.labels);
    },
    async exportPNG(attitude: Attitude) {
      const surface = assets.snapshot();
      if (!surface) throw new Error(text.exportFailed);
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const ratio = EXPORT_LONG_EDGE / Math.max(width, height);
      const layout = frameLayout(width, height, ratio, attitude.zoom);
      const blob = await exportMapPNG(device, computePipeline, sampler, surface.texture, surface.borders, layout, quat.clone(attitude.rotation),
        surface.style, surface.labels, ratio);
      return { blob, width: layout.width, height: layout.height };
    },
    destroy() {
      assets.destroy();
      map.destroy();
      globe.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
