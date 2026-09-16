import { mat4, quat } from 'gl-matrix';

export type SurfaceStyle = { borders: boolean; darkBorders: boolean };
type Viewport = readonly [x: number, y: number, scale: number, mode: number];

// Matches View in earth.wgsl. Each render target owns an independent buffer.
export function createViewUniform(device: GPUDevice) {
  const values = new Float32Array(24);
  const buffer = device.createBuffer({
    size: values.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const inverse = quat.create();
  const matrix = mat4.create();

  return {
    buffer,
    write(rotation: quat, viewport: Viewport, style: SurfaceStyle) {
      mat4.fromQuat(matrix, quat.conjugate(inverse, rotation));
      values.set(matrix);
      values.set(viewport, 16);
      values.set([Number(style.borders), Number(style.darkBorders), 0, 0], 20);
      device.queue.writeBuffer(buffer, 0, values);
    },
    destroy() { buffer.destroy(); },
  };
}
