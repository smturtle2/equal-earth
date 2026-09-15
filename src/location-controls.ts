import { text } from './i18n';

// Owns the one-shot location request and its UI. Motion owns the journey.
export function createLocationControls() {
  const button = document.querySelector<HTMLButtonElement>('#locate')!;
  const status = document.querySelector<HTMLSpanElement>('#location-status')!;
  const marker = document.querySelector<HTMLElement>('#location-marker')!;
  let enabled = false;
  let phase: 'idle' | 'locating' | 'moving' = 'idle';
  let request = 0;
  let markerTimer: ReturnType<typeof setTimeout> | undefined;
  let locate: (latitude: number, longitude: number) => void;
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
    hideMarker();
    update();
  };
  const fail = (message: string) => {
    phase = 'idle';
    status.textContent = message;
    status.dataset.error = 'true';
    update();
  };

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
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          fail(text.locationUnavailable);
          return;
        }
        phase = 'moving';
        status.textContent = text.locationMoving;
        locate(latitude, longitude);
      }, (error) => {
        if (current !== request) return;
        fail(error.code === 1 ? text.locationDenied : error.code === 3 ? text.locationTimeout : text.locationUnavailable);
      }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
    } catch {
      fail(text.locationUnavailable);
    }
  });

  return {
    setEnabled(value: boolean) { enabled = value; if (!value) cancel(); update(); },
    onLocate(handler: typeof locate) { locate = handler; },
    cancel,
    arrive() {
      if (phase !== 'moving') return;
      phase = 'idle';
      status.textContent = text.locationReady;
      marker.hidden = false;
      markerTimer = setTimeout(hideMarker, 1600);
      update();
    },
  };
}
