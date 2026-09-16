import { textures, type TextureId } from './textures';
import { bindSelectMenu } from './select-menu';

export function createTextureControls() {
  const control = document.querySelector<HTMLDivElement>('#texture-control')!;
  const trigger = document.querySelector<HTMLButtonElement>('#texture')!;
  const label = document.querySelector<HTMLSpanElement>('#texture-label')!;
  const menu = document.querySelector<HTMLDivElement>('#texture-menu')!;
  const status = document.querySelector<HTMLSpanElement>('#texture-status')!;
  let enabled = false;
  let busy = true;
  let change: (id: TextureId) => void = () => {};
  const options = Object.entries(textures).map(([id, texture]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('role', 'menuitemradio');
    option.dataset.texture = id;
    option.textContent = texture.label;
    option.tabIndex = -1;
    option.addEventListener('click', () => {
      if (!enabled || busy) return;
      setSelection(id as TextureId);
      menu.hidePopover();
      trigger.focus();
      change(id as TextureId);
    });
    menu.append(option);
    return option;
  });
  function updateAvailability() {
    const disabled = !enabled || busy;
    trigger.disabled = disabled;
    for (const option of options) option.disabled = disabled;
    if (disabled) menu.hidePopover();
  }
  function setSelection(id: TextureId) {
    label.textContent = textures[id].label;
    for (const option of options) option.setAttribute('aria-checked', String(option.dataset.texture === id));
  }
  bindSelectMenu(trigger, menu, options);
  setSelection('natural-earth');
  updateAvailability();
  return {
    setSelection,
    onChange(handler: (id: TextureId) => void) { change = handler; },
    setEnabled(value: boolean) { enabled = value; updateAvailability(); },
    setBusy(value: boolean) {
      busy = value;
      control.setAttribute('aria-busy', String(busy));
      updateAvailability();
    },
    setStatus(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); },
  };
}
