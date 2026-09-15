import './style.css';
import { Motion } from './motion';
import { bindInteraction } from './interaction';
import { createRenderer } from './renderer';
import { textures, type TextureId } from './textures';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;
const selector = document.querySelector<HTMLSelectElement>('#texture')!;
const textureStatus = document.querySelector<HTMLSpanElement>('#texture-status')!;
for (const [id, texture] of Object.entries(textures)) selector.add(new Option(texture.label, id));
const motion = new Motion();
let failed = false;

function showFailure(text: string): void {
  failed = true;
  message.textContent = text;
  message.hidden = false;
  canvas.setAttribute('aria-busy', 'false');
  canvas.dataset.state = 'error';
  selector.disabled = true;
  textureStatus.textContent = '';
}

try {
  const renderer = await createRenderer(canvas, showFailure);
  let selected: TextureId = 'natural-earth';
  textureStatus.textContent = '지도를 불러오는 중…';
  try {
    await renderer.setTexture(selected);
  } catch (error) {
    renderer.destroy();
    throw error;
  }
  canvas.dataset.texture = selected;
  textureStatus.textContent = '';
  selector.disabled = false;
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
      if (motion.moving) invalidate();
    });
  };
  let selectionRequest = 0;
  selector.addEventListener('change', async () => {
    const request = ++selectionRequest;
    const id = selector.value as TextureId;
    textureStatus.textContent = '지도를 불러오는 중…';
    selector.setAttribute('aria-busy', 'true');
    try {
      if (!await renderer.setTexture(id) || request !== selectionRequest) return;
      selected = id;
      canvas.dataset.texture = id;
      textureStatus.textContent = '';
      invalidate();
    } catch (error) {
      if (request !== selectionRequest || failed) return;
      selector.value = selected;
      textureStatus.textContent = error instanceof Error ? error.message : '이미지를 불러오지 못했습니다. 다시 선택해 주세요.';
    } finally {
      if (request === selectionRequest) selector.setAttribute('aria-busy', 'false');
    }
  });
  bindInteraction(canvas, motion, invalidate);
  new ResizeObserver(invalidate).observe(canvas);
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
