import { quat } from 'gl-matrix';
import { text } from './i18n';
import { viewPresets, type ViewPreset } from './view-presets';
import { bindSelectMenu } from './select-menu';

export function createPresetControls() {
  const container = document.getElementById('view-presets')!;
  container.setAttribute('aria-label', text.presets);
  const trigger = document.querySelector<HTMLButtonElement>('#preset')!;
  const label = document.getElementById('preset-label')!;
  const menu = document.getElementById('preset-menu')!;
  trigger.setAttribute('aria-label', text.presets);
  menu.setAttribute('aria-label', text.presets);
  label.textContent = text.presetChoose;
  let select: (preset: ViewPreset) => void;
  const buttons = viewPresets.map((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text.presetNames[preset.id];
    button.dataset.preset = preset.id;
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', 'false');
    button.tabIndex = -1;
    button.disabled = true;
    button.addEventListener('click', () => {
      menu.hidePopover();
      trigger.focus({ preventScroll: true });
      select(preset);
    });
    menu.append(button);
    return button;
  });
  const placeMenu = () => {
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 32);
    const top = bounds.bottom + 8;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(16, Math.min(bounds.right - width, window.innerWidth - width - 16))}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(44, window.innerHeight - top - 16)}px`;
  };
  menu.addEventListener('beforetoggle', event => { if ((event as ToggleEvent).newState === 'open') placeMenu(); });
  window.addEventListener('resize', () => { if (menu.matches(':popover-open')) placeMenu(); });
  bindSelectMenu(trigger, menu, buttons);
  return {
    onSelect(handler: typeof select) { select = handler; },
    setEnabled(enabled: boolean) {
      trigger.disabled = !enabled;
      buttons.forEach(button => { button.disabled = !enabled; });
      if (!enabled) menu.hidePopover();
    },
    update(rotation: quat) {
      let selected: ViewPreset | undefined;
      viewPresets.forEach((preset, index) => {
        // Compare full orientation so manual roll also clears the selection.
        const sign = quat.dot(rotation, preset.rotation) < 0 ? -1 : 1;
        const distance = Math.hypot(...Array.from(rotation, (v, i) => v - sign * preset.rotation[i]));
        const matches = distance < 1e-5;
        buttons[index].setAttribute('aria-checked', String(matches));
        if (matches) selected = preset;
      });
      label.textContent = selected ? text.presetNames[selected.id] : text.presetChoose;
    },
  };
}
