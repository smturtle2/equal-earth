@group(0) @binding(0) var frame: texture_2d<f32>;

@fragment fn fragmentMain(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  return textureLoad(frame, vec2<i32>(pixel.xy), 0);
}
