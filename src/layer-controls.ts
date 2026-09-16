import { text } from './i18n';
import type { MapLayers } from './earth-assets';

export function createLayerControls() {
  const button = document.querySelector<HTMLButtonElement>('#map-details')!;
  const status = document.querySelector<HTMLElement>('#layer-status')!;
  button.title = text.layers;
  let active = false, enabled = false, busy = false, customized = false;
  let change: (value: MapLayers) => Promise<void> = async () => {};
  function update() {
    button.disabled = !enabled || busy;
    button.setAttribute('aria-busy', String(busy));
    button.setAttribute('aria-pressed', String(active));
  }
  async function apply(next: boolean) {
    if (!enabled || busy) return;
    busy = true;
    status.textContent = '';
    update();
    try { await change({ borders: next, labels: next }); active = next; }
    catch { status.textContent = text.layersFailed; status.dataset.error = 'true'; }
    finally { busy = false; update(); }
  }
  button.addEventListener('click', () => { customized = true; void apply(!active); });
  update();
  return {
    onChange(handler: typeof change) { change = handler; },
    setEnabled(value: boolean) { enabled = value; update(); },
    async enableDefaults() { if (!customized) await apply(true); },
  };
}
