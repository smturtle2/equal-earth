import { text } from './i18n';
import { textures, type TextureId } from './textures';
import type { MapLabel } from './map-labels';
import type { SurfaceStyle } from './view-uniform';

export type MapLayers = { borders: boolean; labels: boolean };

// Own all geographic image resources, including cancellation and lazy details.
// Renderers borrow snapshots; only this owner replaces or destroys the textures.
export function createEarthAssets(device: GPUDevice) {
  let disposed = false;
  let texture: GPUTexture | undefined;
  let selected: TextureId = 'natural-earth';
  let loading: AbortController | undefined;
  let layers: MapLayers = { borders: false, labels: false };
  let labels: MapLabel[] = [];
  const layerRequest = new AbortController();
  let layerLoading: Promise<void> | undefined;
  let layersLoaded = false;
  let borders = device.createTexture({
    label: 'empty borders', size: [1, 1], format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: borders }, new Uint8Array(4), {}, [1, 1]);

  return {
    async setTexture(id: TextureId): Promise<boolean> {
      if (disposed) return false;
      loading?.abort();
      const request = new AbortController();
      loading = request;
      const source = textures[id];
      try {
        const next = await loadEarthImage(device, `textures/${source.file}`, source.label, request.signal);
        if (disposed || request.signal.aborted) { next.destroy(); return false; }
        texture?.destroy();
        texture = next;
        selected = id;
        return true;
      } catch (error) {
        if (request.signal.aborted) return false;
        throw error;
      }
    },
    async setLayers(next: MapLayers) {
      if (disposed) return;
      if ((next.borders || next.labels) && !layersLoaded) {
        layerLoading ??= loadMapLayers(device, layerRequest.signal).then(assets => {
          if (disposed) { assets.borders.destroy(); return; }
          borders.destroy();
          borders = assets.borders;
          labels = assets.labels;
          layersLoaded = true;
        }).finally(() => { layerLoading = undefined; });
        await layerLoading;
      }
      if (!disposed) layers = { ...next };
    },
    snapshot() {
      if (disposed || !texture) return;
      const style: SurfaceStyle = { borders: layers.borders, darkBorders: textures[selected].darkBorders };
      return { texture, borders, style, layers, labels: layers.labels ? labels : [] };
    },
    destroy() {
      disposed = true;
      loading?.abort();
      layerRequest.abort();
      borders.destroy();
      texture?.destroy();
    },
  };
}

async function loadMapLayers(device: GPUDevice, signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}layers/labels.json`, { signal });
  if (!response.ok) throw new Error(text.layersFailed);
  const { labels } = await response.json() as { labels: MapLabel[] };
  if (!Array.isArray(labels) || !labels.length || labels.some(label =>
    !label || typeof label.id !== 'string' || !label.id
    || !Number.isFinite(label.longitude) || !Number.isFinite(label.latitude)
    || Math.abs(label.longitude) > 180 || Math.abs(label.latitude) > 90
    || typeof label.name_en !== 'string' || !label.name_en || !Number.isFinite(label.rank)
    || (label.name_ko != null && typeof label.name_ko !== 'string')
    || !['country', 'capital'].includes(label.kind))) throw new Error(text.layersFailed);
  const borders = await loadEarthImage(device, 'layers/borders.png', text.borders, signal);
  return { borders, labels };
}

async function loadEarthImage(device: GPUDevice, path: string, label: string, signal: AbortSignal): Promise<GPUTexture> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal });
  if (!response.ok) throw new Error(text.textureFailed(label));
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' });
  let texture: GPUTexture | undefined;
  try {
    signal.throwIfAborted();
    if (bitmap.width !== bitmap.height * 2 || bitmap.width > device.limits.maxTextureDimension2D) {
      throw new Error(text.textureSize);
    }
    texture = device.createTexture({ label, size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm-srgb', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
    return texture;
  } catch (error) {
    texture?.destroy();
    throw error;
  } finally {
    bitmap.close();
  }
}
