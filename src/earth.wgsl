// Shared uniform layout for the map, globe, and PNG export.
struct View {
  inverseRotation: mat4x4<f32>,
  // Center, scale, and a mode flag interpreted by each projection.
  viewport: vec4<f32>,
  // Border visibility and dark ink, followed by two reserved values.
  details: vec4<f32>,
}

@group(0) @binding(3) var earth: texture_2d<f32>;
@group(0) @binding(4) var earthSampler: sampler;
@group(0) @binding(5) var borders: texture_2d<f32>;

fn surfaceColor(direction: vec3<f32>, details: vec4<f32>) -> vec3<f32> {
  let world = normalize(direction);
  let longitude = atan2(world.x, world.z);
  let latitude = asin(clamp(world.y, -1.0, 1.0));
  let uv = vec2<f32>(longitude / 6.283185307179586 + 0.5, 0.5 - latitude / 3.141592653589793);
  // Longitude repeats across the source seam; latitude ends at the image edge.
  // Every screen subpixel uses the same geographic lookup at full source detail.
  let base = textureSampleLevel(earth, earthSampler, uv, 0.0).rgb;
  if (details.x < 0.5) { return base; }
  let edge = textureSampleLevel(borders, earthSampler, uv, 0.0).a;
  let ink = select(vec3<f32>(0.92), vec3<f32>(0.10, 0.16, 0.20), details.y > 0.5);
  return mix(base, ink, edge * 0.85);
}

fn encodeSRGB(linear: vec3<f32>) -> vec3<f32> {
  return select(1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - 0.055,
    12.92 * linear, linear <= vec3<f32>(0.0031308));
}
