import { text, localizeDocument } from './i18n';
import './style.css';
import { Motion } from './motion';
import { bindInteraction } from './interaction';
import { createRenderer } from './renderer';
import type { TextureId } from './textures';
import { createTextureControls } from './texture-controls';
import { createDownloadControls } from './download-controls';
import { createNavigationControls } from './navigation-controls';
import { bindGlobeControls } from './globe-controls';
import { GLOBE_RADIUS_RATIO } from './layout';
import { createLayerControls } from './layer-controls';

localizeDocument();

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const globeCanvas = document.querySelector<HTMLCanvasElement>('#globe')!;
const labelCanvas = document.querySelector<HTMLCanvasElement>('#map-labels')!;
const globeButton = document.querySelector<HTMLButtonElement>('#globe-layers-button')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;
const textureControls = createTextureControls();
const downloadControls = createDownloadControls();
const navigationControls = createNavigationControls();
const layerControls = createLayerControls();
const motion = new Motion();
navigationControls.update(motion.attitude.rotation, false);
let failed = false;

function showFailure(text: string): void {
  failed = true;
  message.textContent = text;
  message.hidden = false;
  canvas.setAttribute('aria-busy', 'false');
  canvas.dataset.state = 'error';
  globeCanvas.dataset.state = 'error';
  globeCanvas.setAttribute('aria-busy', 'false');
  globeButton.disabled = true;
  downloadControls.setEnabled(false);
  navigationControls.setEnabled(false);
  layerControls.setEnabled(false);
  textureControls.setEnabled(false);
  textureControls.setBusy(false);
  textureControls.setStatus('');
}

try {
  const renderer = await createRenderer(canvas, globeCanvas, labelCanvas, showFailure);
  let selected: TextureId = 'natural-earth';
  textureControls.setStatus(text.loading);
  try {
    await renderer.setTexture(selected);
  } catch (error) {
    renderer.destroy();
    throw error;
  }
  canvas.dataset.texture = selected;
  textureControls.setStatus('');
  textureControls.setEnabled(true);
  textureControls.setBusy(false);
  globeButton.disabled = false;
  downloadControls.onDownload(async () => {
    const texture = selected;
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const { blob, width, height } = await renderer.exportPNG(motion.attitude);
    const name = `equal-earth-${texture}-${width}x${height}-${date}.png`;
    return { blob, name };
  });
  downloadControls.setEnabled(true);
  let pendingFrame: number | null = null;
  const invalidate = () => {
    if (failed || pendingFrame !== null || document.hidden) return;
    pendingFrame = requestAnimationFrame((now) => {
      pendingFrame = null;
      if (failed || document.hidden) return;
      motion.advance(now);
      renderer.draw(motion.attitude);
      navigationControls.update(motion.attitude.rotation, motion.traveling);
      canvas.setAttribute('aria-busy', 'false');
      canvas.dataset.state = 'ready';
      globeCanvas.setAttribute('aria-busy', 'false');
      globeCanvas.dataset.state = 'ready';
      if (motion.moving) invalidate();
    });
  };
  navigationControls.onMove((latitude, longitude) => {
    motion.centerOn(latitude, longitude, performance.now(), matchMedia('(prefers-reduced-motion: reduce)').matches);
    invalidate();
  });
  navigationControls.onEdit(() => { motion.stop(performance.now()); invalidate(); });
  navigationControls.onOrient((rotation) => {
    motion.orientTo(rotation, performance.now(), matchMedia('(prefers-reduced-motion: reduce)').matches);
    invalidate();
  });
  navigationControls.setEnabled(true);
  layerControls.onChange(async layers => {
    await renderer.setLayers(layers);
    invalidate();
  });
  layerControls.setEnabled(true);
  let selectionRequest = 0;
  textureControls.onChange(async (id) => {
    const request = ++selectionRequest;
    textureControls.setStatus(text.loading);
    textureControls.setBusy(true);
    downloadControls.setEnabled(false);
    try {
      if (!await renderer.setTexture(id) || request !== selectionRequest) return;
      selected = id;
      canvas.dataset.texture = id;
      textureControls.setStatus('');
      invalidate();
      if (id === 'political') await layerControls.usePoliticalDefaults();
    } catch (error) {
      if (request !== selectionRequest || failed) return;
      textureControls.setSelection(selected);
      textureControls.setStatus(error instanceof Error ? error.message : text.retry, true);
    } finally {
      if (request === selectionRequest) {
        textureControls.setBusy(false);
        downloadControls.setEnabled(!failed);
      }
    }
  });
  bindGlobeControls((layer) => {
    renderer.setGlobeLayer(layer);
    globeCanvas.dataset.layer = layer;
    globeCanvas.setAttribute('aria-label', layer === 'map' ? text.globeMap : text.globeGrid);
    invalidate();
  });
  bindInteraction([{ canvas, zoom: true }, { canvas: globeCanvas, zoom: false, radiusRatio: GLOBE_RADIUS_RATIO }],
    motion, invalidate, navigationControls.cancel);
  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(canvas);
  resizeObserver.observe(globeCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) navigationControls.cancel();
    invalidate();
  });
  window.addEventListener('resize', invalidate);
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) renderer.destroy();
  });
  window.addEventListener('pageshow', invalidate);
  invalidate();
} catch (error) {
  console.error(error);
  showFailure(error instanceof Error ? error.message : text.mapFailed);
}
