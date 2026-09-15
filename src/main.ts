import './style.css';
import { Motion } from './motion';
import { bindInteraction } from './interaction';
import { createRenderer } from './renderer';
import type { TextureId } from './textures';
import { createTextureControls } from './texture-controls';
import { bindGlobeControls } from './globe-controls';
import { GLOBE_RADIUS_RATIO } from './layout';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const globeCanvas = document.querySelector<HTMLCanvasElement>('#globe')!;
const globeButton = document.querySelector<HTMLButtonElement>('#globe-layers-button')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;
const textureControls = createTextureControls();
const motion = new Motion();
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
  textureControls.setEnabled(false);
  textureControls.setBusy(false);
  textureControls.setStatus('');
}

try {
  const renderer = await createRenderer(canvas, globeCanvas, showFailure);
  let selected: TextureId = 'natural-earth';
  textureControls.setStatus('지도를 불러오는 중…');
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
  let pendingFrame: number | null = null;
  const invalidate = () => {
    if (failed || pendingFrame !== null || document.hidden) return;
    pendingFrame = requestAnimationFrame((now) => {
      pendingFrame = null;
      if (failed || document.hidden) return;
      motion.advance(now);
      renderer.draw(motion.attitude);
      canvas.setAttribute('aria-busy', 'false');
      canvas.dataset.state = 'ready';
      globeCanvas.setAttribute('aria-busy', 'false');
      globeCanvas.dataset.state = 'ready';
      if (motion.moving) invalidate();
    });
  };
  let selectionRequest = 0;
  textureControls.onChange(async (id) => {
    const request = ++selectionRequest;
    textureControls.setStatus('지도를 불러오는 중…');
    textureControls.setBusy(true);
    try {
      if (!await renderer.setTexture(id) || request !== selectionRequest) return;
      selected = id;
      canvas.dataset.texture = id;
      textureControls.setStatus('');
      invalidate();
    } catch (error) {
      if (request !== selectionRequest || failed) return;
      textureControls.setSelection(selected);
      textureControls.setStatus(error instanceof Error ? error.message : '이미지를 불러오지 못했습니다. 다시 선택해 주세요.', true);
    } finally {
      if (request === selectionRequest) textureControls.setBusy(false);
    }
  });
  bindGlobeControls((layer) => {
    renderer.setGlobeLayer(layer);
    globeCanvas.dataset.layer = layer;
    globeCanvas.setAttribute('aria-label', `${layer === 'map' ? '지도 텍스처' : '위도·경도'} 지구본. 지도와 함께 회전합니다. 드래그 또는 방향키로 회전, Q와 E로 비틀기.`);
    invalidate();
  });
  bindInteraction([{ canvas, zoom: true }, { canvas: globeCanvas, zoom: false, radiusRatio: GLOBE_RADIUS_RATIO }], motion, invalidate);
  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(canvas);
  resizeObserver.observe(globeCanvas);
  document.addEventListener('visibilitychange', invalidate);
  window.addEventListener('resize', invalidate);
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) renderer.destroy();
  });
  window.addEventListener('pageshow', invalidate);
  invalidate();
} catch (error) {
  console.error(error);
  showFailure(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.');
}
