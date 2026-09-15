@group(0) @binding(3) var earth: texture_2d<f32>;
@group(0) @binding(4) var earthSampler: sampler;

fn surfaceColor(direction: vec3<f32>) -> vec3<f32> {
  let world = normalize(direction);
  let longitude = atan2(world.x, world.z);
  let latitude = asin(clamp(world.y, -1.0, 1.0));
  let uv = vec2<f32>(longitude / 6.283185307179586 + 0.5, 0.5 - latitude / 3.141592653589793);
  // Longitude repeats across the source seam; latitude ends at the image edge.
  // Every screen subpixel uses the same geographic lookup at full source detail.
  return textureSampleLevel(earth, earthSampler, uv, 0.0).rgb;
}

fn encodeSRGB(linear: vec3<f32>) -> vec3<f32> {
  return select(1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - 0.055,
    12.92 * linear, linear <= vec3<f32>(0.0031308));
}
