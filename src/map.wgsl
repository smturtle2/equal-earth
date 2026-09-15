struct View {
  inverseRotation: mat4x4<f32>,
  viewport: vec4<f32>,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> rows: array<vec4<f32>>;
@group(0) @binding(2) var frame: texture_storage_2d<rgba8unorm, write>;

override SAMPLE_GRID: u32 = 4u;

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
  let size = textureDimensions(frame);
  if (id.x >= size.x || id.y >= size.y) { return; }
  var color = vec3<f32>(0.0);
  // The same finite-area integration rule applies at every orientation.
  for (var sy = 0u; sy < SAMPLE_GRID; sy++) {
    let row = rows[id.y * SAMPLE_GRID + sy];
    for (var sx = 0u; sx < SAMPLE_GRID; sx++) {
      let x = f32(id.x) + (f32(sx) + 0.5) / f32(SAMPLE_GRID);
      let longitude = (x - view.viewport.x) / view.viewport.z * row.z;
      var sampleColor = vec3<f32>(1.0);
      if (row.w > 0.0 && abs(longitude) <= 3.141592653589793) {
        let direction = vec3<f32>(row.y * sin(longitude), row.x, row.y * cos(longitude));
        let world = (view.inverseRotation * vec4<f32>(direction, 0.0)).xyz;
        sampleColor = surfaceColor(world);
      }
      color += sampleColor;
    }
  }
  textureStore(frame, id.xy, vec4<f32>(encodeSRGB(color / f32(SAMPLE_GRID * SAMPLE_GRID)), 1.0));
}
