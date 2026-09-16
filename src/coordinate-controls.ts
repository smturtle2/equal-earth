import { text } from './i18n';
import { formatCoordinates, parseCoordinates, type Coordinates } from './coordinates';

// Owns the editable draft. Display updates never overwrite an open editor.
export function createCoordinateControls() {
  const container = document.querySelector<HTMLElement>('#coordinate-control')!;
  const button = document.querySelector<HTMLButtonElement>('#coordinates')!;
  const value = document.querySelector<HTMLElement>('#coordinate-value')!;
  const form = document.querySelector<HTMLFormElement>('#coordinate-form')!;
  const input = document.querySelector<HTMLInputElement>('#coordinate-input')!;
  const error = document.querySelector<HTMLElement>('#coordinate-error')!;
  const cancelButton = document.querySelector<HTMLButtonElement>('#coordinate-cancel')!;
  let current: Coordinates = { latitude: 0, longitude: 0 };
  let enabled = false;
  let edit: () => void;
  let move: (latitude: number, longitude: number) => void;

  const clearError = () => {
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    error.hidden = true;
  };
  const close = (restoreFocus = false) => {
    form.hidden = true;
    button.hidden = false;
    container.dataset.editing = 'false';
    button.setAttribute('aria-expanded', 'false');
    clearError();
    if (restoreFocus) button.focus({ preventScroll: true });
  };
  button.addEventListener('click', () => {
    if (!enabled) return;
    edit();
    input.value = `${Number(current.latitude.toFixed(6))}, ${Number(current.longitude.toFixed(6))}`;
    button.hidden = true;
    form.hidden = false;
    container.dataset.editing = 'true';
    button.setAttribute('aria-expanded', 'true');
    input.focus({ preventScroll: true });
    input.select();
  });
  cancelButton.addEventListener('click', () => close(true));
  form.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  input.addEventListener('input', clearError);
  input.addEventListener('paste', event => {
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    if (pasted.split(',').length !== 2) return;
    event.preventDefault();
    input.value = pasted.trim();
    clearError();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!enabled) return;
    const result = parseCoordinates(input.value);
    clearError();
    if ('error' in result) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = result.error === 'format' ? text.coordinatesInvalid
        : result.error === 'latitude' ? text.latitudeInvalid : text.longitudeInvalid;
      error.hidden = false;
      input.focus({ preventScroll: true });
      return;
    }
    close(true);
    move(result.point.latitude, result.point.longitude);
  });
  return {
    update(point: Coordinates) {
      current = point;
      const label = formatCoordinates(point);
      if (value.textContent !== label) value.textContent = label;
    },
    setEnabled(next: boolean) {
      enabled = next;
      button.disabled = !enabled;
      for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) control.disabled = !enabled;
      if (!enabled) close();
    },
    close,
    onEdit(handler: typeof edit) { edit = handler; },
    onMove(handler: typeof move) { move = handler; },
  };
}
