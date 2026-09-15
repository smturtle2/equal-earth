export type Locale = 'en' | 'ko';

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'ko' || base === 'en') return base;
  }
  return 'en';
}

const translations = {
  en: {
    description: 'A world map with a center you choose. Rotate the Equal Earth map and synchronized globe, and compare Natural Earth II with NASA Blue Marble.',
    title: 'Equal Earth — A world without a fixed center',
    imageAlt: 'Equal Earth world map in the default view',
    mapLabel: 'Equal Earth map. Drag to rotate, Shift-drag or Q and E to roll, scroll to zoom. Arrow keys rotate; 0 or double-click resets the view.',
    texture: 'Map texture',
    textureMenu: 'Map textures',
    globe: 'Synchronized globe',
    globeLayers: 'Globe layers',
    globeGrid: 'Graticule globe. Rotates with the map. Drag or use arrow keys to rotate; Q and E to roll.',
    globeMap: 'Textured globe. Rotates with the map. Drag or use arrow keys to rotate; Q and E to roll.',
    controls: 'Controls',
    locate: 'Center on my location',
    locating: 'Locating…',
    locationMoving: 'Moving to your location…',
    locationReady: 'Centered on your location.',
    locationDenied: 'Location permission was denied. Allow location in your browser, then retry.',
    locationUnavailable: 'Your location is unavailable.',
    locationTimeout: 'Location request timed out. Please retry.',
    locationUnsupported: 'Location is not supported by this browser.',
    helpMouse: ['Drag to rotate · Scroll to zoom', 'Q / E to roll · Double-click to reset'],
    helpTouch: ['One finger to rotate', 'Two fingers to zoom & roll'],
    loading: 'Loading map…',
    download: 'Download map as 4K PNG',
    exporting: 'Preparing 4K PNG…',
    exportReady: 'PNG is ready. Download started.',
    exportFailed: 'Could not save the image. Please try again.',
    exportSize: 'This graphics device cannot export a 4K image.',
    textureFailed: (name: string) => `Could not load the ${name} image.`,
    textureSize: 'This graphics device does not support the Earth image dimensions.',
    retry: 'Could not load the image. Please select it again.',
    mapFailed: 'Could not load the map.',
    webgpu: 'Open this map in a browser with WebGPU enabled.',
    adapter: 'WebGPU is unavailable in this environment.',
    mapSurface: 'Could not create the map display.',
    globeSurface: 'Could not create the globe display.',
    drawFailed: 'Could not render the map. Please reload the page.',
    deviceLost: 'The graphics connection was lost. Please reload the page.',
  },
  ko: {
    description: '중심을 바꿔 보는 세계지도. Equal Earth 지도와 지구본을 자유롭게 회전하고 Natural Earth II와 NASA Blue Marble을 비교하세요.',
    title: 'Equal Earth — 중심을 바꿔 보는 세계지도',
    imageAlt: '기본 시점의 Equal Earth 세계지도',
    mapLabel: 'Equal Earth 지도. 드래그로 회전, Shift 드래그 또는 Q와 E로 비틀기, 휠로 확대. 방향키로 회전, 0 또는 더블 클릭으로 초기화.',
    texture: '지도 텍스처',
    textureMenu: '지도 텍스처 목록',
    globe: '동기화된 지구본',
    globeLayers: '지구본 레이어',
    globeGrid: '위도·경도 지구본. 지도와 함께 회전합니다. 드래그 또는 방향키로 회전, Q와 E로 비틀기.',
    globeMap: '지도 텍스처 지구본. 지도와 함께 회전합니다. 드래그 또는 방향키로 회전, Q와 E로 비틀기.',
    controls: '조작법',
    locate: '내 위치로 이동',
    locating: '위치를 찾는 중…',
    locationMoving: '내 위치로 이동하는 중…',
    locationReady: '내 위치로 이동했습니다.',
    locationDenied: '위치 권한이 거부되었습니다. 브라우저에서 위치를 허용한 후 다시 시도해 주세요.',
    locationUnavailable: '현재 위치를 확인할 수 없습니다.',
    locationTimeout: '위치 요청 시간이 초과되었습니다. 다시 시도해 주세요.',
    locationUnsupported: '이 브라우저는 위치 기능을 지원하지 않습니다.',
    helpMouse: ['드래그 회전 · 휠 확대', 'Q / E 비틀기 · 더블 클릭 초기화'],
    helpTouch: ['한 손가락으로 회전', '두 손가락으로 확대·비틀기'],
    loading: '지도를 불러오는 중…',
    download: '지도 4K PNG 다운로드',
    exporting: '4K PNG를 만드는 중…',
    exportReady: 'PNG를 만들었습니다. 다운로드를 시작합니다.',
    exportFailed: '이미지를 저장하지 못했습니다. 다시 시도해 주세요.',
    exportSize: '이 그래픽 장치에서는 4K 이미지를 저장할 수 없습니다.',
    textureFailed: (name: string) => `${name} 이미지를 불러오지 못했습니다.`,
    textureSize: '지구 이미지 크기를 이 그래픽 장치에서 사용할 수 없습니다.',
    retry: '이미지를 불러오지 못했습니다. 다시 선택해 주세요.',
    mapFailed: '지도를 불러오지 못했습니다.',
    webgpu: 'WebGPU를 사용할 수 있는 브라우저에서 열어 주세요.',
    adapter: '이 환경에서 WebGPU를 사용할 수 없습니다.',
    mapSurface: 'WebGPU 화면을 만들 수 없습니다.',
    globeSurface: '지구본 화면을 만들 수 없습니다.',
    drawFailed: '지도를 그리지 못했습니다. 새로고침해 주세요.',
    deviceLost: '그래픽 연결이 끊겼습니다. 새로고침해 주세요.',
  },
};

export const locale = resolveLocale(typeof navigator === 'undefined' ? [] : navigator.languages);
export const text = translations[locale];

export function localizeDocument() {
  document.documentElement.lang = locale;
  const labels: Record<string, string> = {
    map: text.mapLabel, 'texture-control': text.texture, texture: text.texture,
    'texture-menu': text.textureMenu, 'globe-panel': text.globe,
    'globe-layers-button': text.globeLayers, globe: text.globeGrid,
    'help-panel': text.controls, download: text.download, locate: text.locate,
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
  document.getElementById('locate')!.setAttribute('title', text.locate);
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
