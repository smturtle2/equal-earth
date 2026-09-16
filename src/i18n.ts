import { translations, type Locale } from './translations';
export type { Locale } from './translations';

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'ko' || base === 'en') return base;
  }
  return 'en';
}

export const locale = resolveLocale(typeof navigator === 'undefined' ? [] : navigator.languages);
export const text = translations[locale];

export function localizeDocument() {
  document.documentElement.lang = locale;
  const labels: Record<string, string> = {
    map: text.mapLabel, 'texture-control': text.texture, texture: text.texture,
    'texture-menu': text.textureMenu, 'globe-panel': text.globe,
    'map-details': text.layers,
    'globe-layers-button': text.globeLayers, globe: text.globeGrid,
    'help-panel': text.controls, 'navigation-controls': text.navigation,
    coordinates: text.coordinates, 'coordinate-form': text.coordinates,
    'coordinate-input': text.coordinateInput,
    'coordinate-cancel': text.coordinateCancel,
    download: text.download, locate: text.locate,
  };
  for (const [id, label] of Object.entries(labels)) document.getElementById(id)!.setAttribute('aria-label', label);
  for (const [id, lines] of [['help-mouse', text.helpMouse], ['help-touch', text.helpTouch]] as const) {
    const container = document.getElementById(id)!;
    for (const line of lines) {
      const hint = document.createElement('span');
      hint.textContent = line;
      container.append(hint);
    }
  }
  document.getElementById('download')!.setAttribute('title', text.download);
  document.getElementById('coordinates')!.setAttribute('title', text.coordinates);
  document.getElementById('coordinate-cancel')!.setAttribute('title', text.coordinateCancel);
  document.getElementById('locate')!.setAttribute('title', text.locate);
  document.getElementById('coordinate-input')!.setAttribute('placeholder', text.coordinateInput);
  document.getElementById('coordinate-go')!.textContent = text.coordinateGo;
  const metadata: Record<string, string> = {
    'meta[name="description"]': text.description,
    'meta[property="og:locale"]': locale === 'ko' ? 'ko_KR' : 'en_US',
    'meta[property="og:title"]': text.title,
    'meta[property="og:description"]': text.description,
    'meta[property="og:image:alt"]': text.imageAlt,
    'meta[name="twitter:title"]': text.title,
    'meta[name="twitter:description"]': text.description,
  };
  for (const [selector, content] of Object.entries(metadata)) document.querySelector(selector)!.setAttribute('content', content);
}
