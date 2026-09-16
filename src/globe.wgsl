struct GlobeView {
  inverseRotation: mat4x4<f32>,
  viewport: vec4<f32>,
  details: vec4<f32>,
}
@group(0) @binding(0) var<uniform> globe: GlobeView;

fn graticule(world: vec3<f32>, radius: f32, depth: f32) -> vec3<f32> {
  let latitude = asin(clamp(world.y, -1.0, 1.0));
  let longitude = atan2(world.x, world.z);
  let step = 0.5235987755982988;
  let parallelDistance = abs(latitude - round(latitude / step) * step);
  let meridianAngle = longitude - round(longitude / step) * step;
  let meridianDistance = abs(asin(sin(meridianAngle) * cos(latitude)));
  let width = 0.8 / radius;
  var color = vec3<f32>(0.9, 0.93, 0.95) * (0.94 + 0.06 * depth);
  if (min(parallelDistance, meridianDistance) < width * 0.5) {
    color = vec3<f32>(0.27, 0.39, 0.47);
  }
  if (abs(latitude) < width * 0.7) { color = vec3<f32>(0.13, 0.27, 0.37); }
  return color;
}

@fragment fn fragmentMain(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  var color = vec3<f32>(0.0);
  var coverage = 0.0;
  for (var sy = 0u; sy < 4u; sy++) {
    for (var sx = 0u; sx < 4u; sx++) {
      let samplePixel = floor(pixel.xy) + (vec2<f32>(f32(sx), f32(sy)) + 0.5) / 4.0;
      let xy = (samplePixel - globe.viewport.xy) / globe.viewport.z * vec2<f32>(1.0, -1.0);
      let distanceSquared = dot(xy, xy);
      if (distanceSquared <= 1.0) {
        let depth = sqrt(max(0.0, 1.0 - distanceSquared));
        let direction = vec3<f32>(xy, depth);
        let world = normalize((globe.inverseRotation * vec4<f32>(direction, 0.0)).xyz);
        if (globe.viewport.w > 0.5) { color += surfaceColor(world, globe.details); }
        else { color += graticule(world, globe.viewport.z, depth); }
        coverage += 1.0;
      }
    }
  }
  if (coverage == 0.0) { return vec4<f32>(0.0); }
  let alpha = coverage / 16.0;
  return vec4<f32>(encodeSRGB(color / coverage) * alpha, alpha);
}
