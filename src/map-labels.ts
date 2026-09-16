import { vec3, type quat } from 'gl-matrix';
import { project, invert } from './projection';
import { geographicDirection } from './coordinates';
import type { FrameLayout } from './map-frame';
import type { Locale } from './i18n';

export type MapLabel = {
  id: string; kind: 'country' | 'capital'; longitude: number; latitude: number;
  name_en: string; name_ko?: string; rank: number;
};
type PlacedLabel = { id: string; name: string; x: number; y: number; width: number; size: number; capital: boolean };

// Layout is in CSS pixels, including for export: increasing output resolution
// keeps the same labels and spacing instead of revealing extra names.
export function placeLabels(labels: MapLabel[], rotation: quat, layout: FrameLayout, language: Locale,
  measure: (name: string, size: number) => number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const density = layout.scale / 180;
  const candidates = labels.filter(label => label.kind === 'country'
    ? label.rank <= Math.max(2, 3 + Math.log2(Math.max(density, 0.1)) * 2)
    : density >= 1.65);
  candidates.sort((a, b) => Number(a.kind === 'capital') - Number(b.kind === 'capital')
    || a.rank - b.rank || a.id.localeCompare(b.id));
  for (const label of candidates) {
    const direction = vec3.transformQuat(vec3.create(), geographicDirection(label), rotation);
    const [px, py] = project(Math.atan2(direction[0], direction[2]), Math.asin(Math.max(-1, Math.min(1, direction[1]))));
    const capital = label.kind === 'capital';
    const size = capital ? 11 : 12;
    const name = language === 'ko' ? label.name_ko || label.name_en : label.name_en;
    const width = measure(name, size) + (capital ? 9 : 0);
    const x = layout.x + px * layout.scale, y = layout.y - py * layout.scale;
    const left = x - width / 2 - 4, right = x + width / 2 + 4;
    const top = y - size / 2 - 4, bottom = y + size / 2 + 4;
    if (left < 0 || top < 0 || right > layout.width || bottom > layout.height) continue;
    // Keep labels whole at the moving antimeridian and curved map boundary.
    if ([left, right].some(cx => [top, bottom].some(cy =>
      !invert((cx - layout.x) / layout.scale, (layout.y - cy) / layout.scale)))) continue;
    if (placed.some(other => Math.abs(x - other.x) < (width + other.width) / 2 + 8
      && Math.abs(y - other.y) < (size + other.size) / 2 + 6)) continue;
    placed.push({ id: label.id, name, x, y, width, size, capital });
  }
  return placed;
}

export function drawLabels(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  labels: MapLabel[], rotation: quat, layout: FrameLayout, language: Locale, ratio = 1): PlacedLabel[] {
  context.save();
  context.scale(ratio, ratio);
  const font = (size: number) => `500 ${size}px system-ui, sans-serif`;
  const placed = placeLabels(labels, rotation, layout, language, (name, size) => {
    context.font = font(size);
    return context.measureText(name).width;
  });
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(255,255,255,0.92)';
  context.fillStyle = '#253a44';
  context.lineWidth = 3;
  for (const label of placed) {
    context.font = font(label.size);
    const x = label.x + (label.capital ? 4.5 : 0);
    context.strokeText(label.name, x, label.y);
    context.fillText(label.name, x, label.y);
    if (label.capital) {
      context.beginPath();
      context.arc(label.x - label.width / 2 + 2, label.y, 2, 0, Math.PI * 2);
      context.stroke();
      context.fill();
    }
  }
  context.restore();
  return placed;
}
