import type { quat } from 'gl-matrix';
import { createMapFrame, type FrameLayout } from './map-frame';
import { text, locale } from './i18n';
import { drawLabels, type MapLabel } from './map-labels';

export const EXPORT_LONG_EDGE = 4096;

export async function exportMapPNG(device: GPUDevice, pipeline: GPUComputePipeline, sampler: GPUSampler,
  texture: GPUTexture, borders: GPUTexture, layout: FrameLayout, rotation: quat,
  details: readonly [boolean, boolean], labels: MapLabel[], ratio: number): Promise<Blob> {
  const { width, height } = layout;
  const rowBytes = Math.ceil(width * 4 / 256) * 256;
  if (Math.max(width, height) > device.limits.maxTextureDimension2D || rowBytes * height > device.limits.maxBufferSize) {
    throw new Error(text.exportSize);
  }
  const target = createMapFrame(device, pipeline, sampler, 'transparent');
  let readback: GPUBuffer | undefined;
  let pixels: Uint8ClampedArray<ArrayBuffer>;
  // Export failures stay local to the download instead of breaking the live map.
  device.pushErrorScope('out-of-memory');
  device.pushErrorScope('validation');
  let validation: Promise<GPUError | null> | undefined;
  let memory: Promise<GPUError | null> | undefined;
  try {
    const commands = device.createCommandEncoder({ label: 'export map PNG' });
    const frame = target.encode(commands, texture, borders, layout, rotation, details);
    readback = device.createBuffer({ label: 'map export readback', size: rowBytes * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    commands.copyTextureToBuffer({ texture: frame }, { buffer: readback, bytesPerRow: rowBytes }, [width, height]);
    device.queue.submit([commands.finish()]);
    // Pop scopes before awaiting so subsequent live frames are not captured by them.
    validation = device.popErrorScope();
    memory = device.popErrorScope();
    const [, validationError, memoryError] = await Promise.all([readback.mapAsync(GPUMapMode.READ), validation, memory]);
    if (validationError || memoryError) throw new Error(text.exportFailed);
    const mapped = new Uint8Array(readback.getMappedRange());
    pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) pixels.set(mapped.subarray(y * rowBytes, y * rowBytes + width * 4), y * width * 4);
  } finally {
    if (!validation) validation = device.popErrorScope();
    if (!memory) memory = device.popErrorScope();
    readback?.destroy();
    target.destroy();
    await Promise.allSettled([validation, memory]);
  }
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error(text.exportFailed);
    context.putImageData(new ImageData(pixels!, width, height), 0, 0);
    if (labels.length) drawLabels(context, labels, rotation, {
      width: width / ratio, height: height / ratio, x: layout.x / ratio, y: layout.y / ratio, scale: layout.scale / ratio,
    }, locale, ratio);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    canvas.width = canvas.height = 1;
  }
}
