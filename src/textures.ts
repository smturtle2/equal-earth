export const textures = {
  'natural-earth': { label: 'Natural Earth II', file: 'natural-earth.jpg' },
  'blue-marble': { label: 'NASA Blue Marble', file: 'blue-marble.jpg' },
} as const;

export type TextureId = keyof typeof textures;

export async function loadTexture(device: GPUDevice, id: TextureId, signal: AbortSignal): Promise<GPUTexture> {
  const response = await fetch(`${import.meta.env.BASE_URL}textures/${textures[id].file}`, { signal });
  if (!response.ok) throw new Error(`${textures[id].label} 이미지를 불러오지 못했습니다.`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' });
  let texture: GPUTexture | undefined;
  try {
    signal.throwIfAborted();
    if (bitmap.width !== bitmap.height * 2 || bitmap.width > device.limits.maxTextureDimension2D) {
      throw new Error('지구 이미지 크기를 이 그래픽 장치에서 사용할 수 없습니다.');
    }
    texture = device.createTexture({ label: textures[id].label, size: [bitmap.width, bitmap.height],
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
