import { text } from './i18n';

// Appearance and default details belong to each texture, not to its consumers.
export const textures = {
  'natural-earth': { label: 'Natural Earth II', file: 'natural-earth.jpg', darkBorders: false, defaultDetails: false },
  'blue-marble': { label: 'NASA Blue Marble', file: 'blue-marble.jpg', darkBorders: false, defaultDetails: false },
  'political': { label: text.atlas, file: 'political.png', darkBorders: true, defaultDetails: true },
} as const;

export type TextureId = keyof typeof textures;
