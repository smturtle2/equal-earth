import { text } from './i18n';

export function createDownloadControls() {
  const button = document.querySelector<HTMLButtonElement>('#download')!;
  const status = document.querySelector<HTMLSpanElement>('#download-status')!;
  let enabled = false;
  let busy = false;
  let download: () => Promise<{ blob: Blob; name: string }>;
  const update = () => { button.disabled = !enabled || busy; };
  button.addEventListener('click', async () => {
    if (!enabled || busy) return;
    busy = true;
    button.setAttribute('aria-busy', 'true');
    status.dataset.error = 'false';
    status.textContent = text.exporting;
    update();
    try {
      const { blob, name } = await download();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      // Leave the URL alive while the browser starts consuming the download.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      status.textContent = text.exportReady;
    } catch (error) {
      console.error('Map export failed:', error);
      status.dataset.error = 'true';
      status.textContent = error instanceof Error && error.message === text.exportSize ? text.exportSize : text.exportFailed;
    } finally {
      busy = false;
      button.setAttribute('aria-busy', 'false');
      update();
    }
  });
  return {
    setEnabled(value: boolean) { enabled = value; update(); },
    onDownload(handler: typeof download) { download = handler; },
  };
}
