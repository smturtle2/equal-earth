import { text } from './i18n';
import type { quat } from 'gl-matrix';
import { centerCoordinates, validCoordinates } from './coordinates';
import { createCoordinateControls } from './coordinate-controls';
import { createPresetControls } from './preset-controls';

// Coordinates and geolocation share one pending destination and arrival state.
// Motion owns the route; the coordinate editor owns its unsubmitted draft.
export function createNavigationControls() {
  const coordinates = createCoordinateControls();
  const presets = createPresetControls();
  const button = document.querySelector<HTMLButtonElement>('#locate')!;
  const status = document.querySelector<HTMLSpanElement>('#location-status')!;
  const marker = document.querySelector<HTMLElement>('#location-marker')!;
  let enabled = false;
  let phase: 'idle' | 'locating' | 'moving' = 'idle';
  let request = 0;
  let markerTimer: ReturnType<typeof setTimeout> | undefined;
  let move: (latitude: number, longitude: number) => void;
  let edit: () => void;
  let orient: (rotation: quat) => void;
  let arrivalMessage = text.locationReady;
  const update = () => {
    button.disabled = !enabled || phase !== 'idle';
    button.setAttribute('aria-busy', String(phase !== 'idle'));
  };
  const hideMarker = () => { clearTimeout(markerTimer); marker.hidden = true; };
  const cancel = (includePending = true) => {
    if (!includePending && phase === 'locating') return;
    ++request; // getCurrentPosition cannot be aborted; discard its late reply.
    phase = 'idle';
    status.textContent = '';
    status.dataset.error = 'false';
    if (includePending) coordinates.close();
    hideMarker();
    update();
  };
  const fail = (message: string) => {
    phase = 'idle';
    status.textContent = message;
    status.dataset.error = 'true';
    update();
  };
  const startMove = (latitude: number, longitude: number, source: 'location' | 'coordinates') => {
    phase = 'moving';
    status.textContent = source === 'location' ? text.locationMoving : text.coordinatesMoving;
    arrivalMessage = source === 'location' ? text.locationReady : text.coordinatesReady;
    update();
    move(latitude, longitude);
  };
  coordinates.onEdit(() => { cancel(); edit(); });
  coordinates.onMove((latitude, longitude) => {
    cancel();
    startMove(latitude, longitude, 'coordinates');
  });
  presets.onSelect((preset) => {
    cancel();
    phase = 'moving';
    status.textContent = text.presetMoving(text.presetNames[preset.id]);
    arrivalMessage = text.presetReady(text.presetNames[preset.id]);
    update();
    orient(preset.rotation);
  });

  button.addEventListener('click', () => {
    if (!enabled || phase !== 'idle') return;
    cancel();
    if (!navigator.geolocation) { fail(text.locationUnsupported); return; }
    const current = ++request;
    phase = 'locating';
    status.textContent = text.locating;
    update();
    try {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (current !== request) return;
        if (document.hidden) { cancel(); return; }
        const { latitude, longitude } = coords;
        if (!validCoordinates({ latitude, longitude })) {
          fail(text.locationUnavailable);
          return;
        }
        startMove(latitude, longitude, 'location');
      }, (error) => {
        if (current !== request) return;
        fail(error.code === 1 ? text.locationDenied : error.code === 3 ? text.locationTimeout : text.locationUnavailable);
      }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
    } catch {
      fail(text.locationUnavailable);
    }
  });

  return {
    setEnabled(value: boolean) { enabled = value; coordinates.setEnabled(value); presets.setEnabled(value); if (!value) cancel(); update(); },
    onMove(handler: typeof move) { move = handler; },
    onOrient(handler: typeof orient) { orient = handler; },
    onEdit(handler: typeof edit) { edit = handler; },
    cancel,
    update(rotation: quat, traveling: boolean) {
      coordinates.update(centerCoordinates(rotation));
      presets.update(rotation);
      if (phase !== 'moving' || traveling) return;
      phase = 'idle';
      status.textContent = arrivalMessage;
      marker.hidden = false;
      markerTimer = setTimeout(hideMarker, 1600);
      update();
    },
  };
}
