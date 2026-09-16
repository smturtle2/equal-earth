// Texture names are fixed source/style names in every interface language.
export const textures = {
  'natural-earth': { label: 'Natural Earth II', file: 'natural-earth.jpg', darkBorders: false },
  'blue-marble': { label: 'NASA Blue Marble', file: 'blue-marble.jpg', darkBorders: false },
  'political': { label: 'Atlas', file: 'political.png', darkBorders: true },
} as const;

export type TextureId = keyof typeof textures;
