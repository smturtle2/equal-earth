import { text } from './i18n';
export const textures = {
  'natural-earth': { label: 'Natural Earth II', file: 'natural-earth.jpg' },
  'blue-marble': { label: 'NASA Blue Marble', file: 'blue-marble.jpg' },
  'political': { label: text.political, file: 'political.png' },
} as const;

export type TextureId = keyof typeof textures;

export async function loadTexture(device: GPUDevice, id: TextureId, signal: AbortSignal): Promise<GPUTexture> {
  return loadEarthImage(device, `textures/${textures[id].file}`, textures[id].label, signal);
}

export async function loadEarthImage(device: GPUDevice, path: string, label: string, signal: AbortSignal): Promise<GPUTexture> {
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
