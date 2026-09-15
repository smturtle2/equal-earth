import { textures, type TextureId } from './textures';

export function createTextureControls() {
  const control = document.querySelector<HTMLDivElement>('#texture-control')!;
  const trigger = document.querySelector<HTMLButtonElement>('#texture')!;
  const label = document.querySelector<HTMLSpanElement>('#texture-label')!;
  const menu = document.querySelector<HTMLDivElement>('#texture-menu')!;
  const status = document.querySelector<HTMLSpanElement>('#texture-status')!;
  let selected: TextureId = 'natural-earth';
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
    selected = id;
    label.textContent = textures[id].label;
    for (const option of options) option.setAttribute('aria-checked', String(option.dataset.texture === id));
  }
  function focusSelection() {
    options.find(option => option.dataset.texture === selected)!.focus();
  }
  // popovertarget owns click toggling and light-dismiss as one browser action.
  trigger.addEventListener('keydown', event => {
    if (!enabled || busy) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    menu.showPopover();
    focusSelection();
  });
  menu.addEventListener('toggle', () => {
    const open = menu.matches(':popover-open');
    trigger.setAttribute('aria-expanded', String(open));
    if (open) focusSelection();
  });
  menu.addEventListener('keydown', event => {
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = (index + 1) % options.length; break;
      case 'ArrowUp': next = (index - 1 + options.length) % options.length; break;
      case 'Home': next = 0; break;
      case 'End': next = options.length - 1; break;
      case 'Escape':
        event.preventDefault();
        menu.hidePopover();
        trigger.focus();
        return;
      case 'Tab': menu.hidePopover(); trigger.focus(); return;
      default: return;
    }
    event.preventDefault();
    options[next].focus();
  });
  setSelection(selected);
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
