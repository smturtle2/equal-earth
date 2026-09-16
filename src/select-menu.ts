// Shared keyboard and focus behavior for single-selection popover menus.
// Each control owns its values, availability and placement.
export function bindSelectMenu(trigger: HTMLButtonElement, menu: HTMLElement, options: HTMLButtonElement[]) {
  const focusSelection = () => (options.find(option => option.getAttribute('aria-checked') === 'true') ?? options[0]).focus();
  trigger.addEventListener('keydown', event => {
    if (trigger.disabled || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
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
}
