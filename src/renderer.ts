import { text, locale } from './i18n';
import { quat } from 'gl-matrix';
import type { Attitude } from './attitude';
import { createMapFrame, createMapPipeline, frameLayout } from './map-frame';
import { exportMapPNG, EXPORT_LONG_EDGE } from './map-export';
import presentation from './present.wgsl?raw';
import fullscreen from './fullscreen.wgsl?raw';
import { loadTexture, type TextureId } from './textures';
import { createGlobeRenderer, type GlobeLayer } from './globe-renderer';
import { loadMapLayers, type MapLayers } from './map-layers';
import { drawLabels, type MapLabel } from './map-labels';

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
  let disposed = false;
  let earthTexture: GPUTexture | undefined;
  let loading: AbortController | undefined;
  let selected: TextureId = 'natural-earth';
  let layers: MapLayers = { borders: false, labels: false };
  let labels: MapLabel[] = [];
  const layerRequest = new AbortController();
  let layerLoading: Promise<void> | undefined;
  let layersLoaded = false;
  let borderTexture = device.createTexture({ label: 'empty borders', size: [1, 1], format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: borderTexture }, new Uint8Array(4), {}, [1, 1]);
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
      if ((next.borders || next.labels) && !layersLoaded) {
        layerLoading ??= loadMapLayers(device, layerRequest.signal).then(assets => {
          if (disposed) { assets.borders.destroy(); return; }
          borderTexture.destroy();
          borderTexture = assets.borders;
          labels = assets.labels;
          layersLoaded = true;
        }).finally(() => { layerLoading = undefined; });
        await layerLoading;
      }
      if (!disposed) layers = { ...next };
    },
    async setTexture(id: TextureId): Promise<boolean> {
      loading?.abort();
      const request = new AbortController();
      loading = request;
      try {
        const texture = await loadTexture(device, id, request.signal);
        if (disposed || request.signal.aborted) { texture.destroy(); return false; }
        earthTexture?.destroy();
        earthTexture = texture;
        selected = id;
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
      const details = [layers.borders, selected === 'political'] as const;
      const frame = map.encode(commands, earthTexture, borderTexture, layout, attitude.rotation, details);
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
      globe.draw(commands, attitude, earthTexture, borderTexture, globeLayer, details);
      device.queue.submit([commands.finish()]);
      if (labelCanvas.width !== layout.width) labelCanvas.width = layout.width;
      if (labelCanvas.height !== layout.height) labelCanvas.height = layout.height;
      labelContext?.clearRect(0, 0, layout.width, layout.height);
      const placed = layers.labels && labelContext
        ? drawLabels(labelContext, labels, attitude.rotation, frameLayout(cssWidth, cssHeight, 1, attitude.zoom), locale, ratio) : [];
      labelCanvas.dataset.count = String(placed.length);
      canvas.dataset.borders = String(layers.borders);
      canvas.dataset.labels = String(layers.labels);
    },
    async exportPNG(attitude: Attitude) {
      if (disposed || !earthTexture) throw new Error(text.exportFailed);
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const ratio = EXPORT_LONG_EDGE / Math.max(width, height);
      const layout = frameLayout(width, height, ratio, attitude.zoom);
      const blob = await exportMapPNG(device, computePipeline, sampler, earthTexture, borderTexture, layout, quat.clone(attitude.rotation),
        [layers.borders, selected === 'political'], layers.labels ? labels : [], ratio);
      return { blob, width: layout.width, height: layout.height };
    },
    destroy() {
      disposed = true;
      loading?.abort();
      layerRequest.abort();
      borderTexture.destroy();
      earthTexture?.destroy();
      map.destroy();
      globe.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
