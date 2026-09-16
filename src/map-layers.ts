import { text } from './i18n';
import { loadEarthImage } from './textures';
import type { MapLabel } from './map-labels';

export type MapLayers = { borders: boolean; labels: boolean };

// The renderer owns these shared geographic assets, independently of the base map.
export async function loadMapLayers(device: GPUDevice, signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}layers/labels.json`, { signal });
  if (!response.ok) throw new Error(text.layersFailed);
  const { labels } = await response.json() as { labels: MapLabel[] };
  if (!Array.isArray(labels) || !labels.length || labels.some(label =>
    !label || typeof label.id !== 'string' || !label.id
    || !Number.isFinite(label.longitude) || !Number.isFinite(label.latitude)
    || Math.abs(label.longitude) > 180 || Math.abs(label.latitude) > 90
    || typeof label.name_en !== 'string' || !label.name_en || !Number.isFinite(label.rank)
    || (label.name_ko != null && typeof label.name_ko !== 'string')
    || !['country', 'capital'].includes(label.kind))) throw new Error(text.layersFailed);
  const borders = await loadEarthImage(device, 'layers/borders.png', text.borders, signal);
  return { borders, labels };
}
