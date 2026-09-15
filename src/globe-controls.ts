import type { GlobeLayer } from './globe-renderer';

export function bindGlobeControls(onChange: (layer: GlobeLayer) => void) {
  const button = document.querySelector<HTMLButtonElement>('#globe-layers-button')!;
  button.addEventListener('click', () => {
    const showMap = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(showMap));
    onChange(showMap ? 'map' : 'graticule');
  });
}
