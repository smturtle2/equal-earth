import { test, expect } from '@playwright/test';

const labels = {
  en: { controls: 'Controls', texture: 'Map texture', coordinates: 'Edit center coordinates', download: 'Download map as 4K PNG', locate: 'Center on my location', error: 'Open this map in a browser with WebGPU enabled.', mouse: /Drag to rotate/, touch: /Two fingers to zoom & roll/ },
  ko: { controls: '조작법', texture: '지도 텍스처', coordinates: '중심 좌표 편집', download: '지도 4K PNG 다운로드', locate: '내 위치로 이동', error: 'WebGPU를 사용할 수 있는 브라우저에서 열어 주세요.', mouse: /드래그 회전/, touch: /두 손가락으로 확대·비틀기/ },
};

test('localizes concise help and errors, falls back to English, and fits touch layouts', async ({ browser, baseURL, request }) => {
  const initialHTML = await (await request.get('/')).text();
  expect(initialHTML).toContain('<html lang="en">');
  expect(initialHTML).toContain('content="en_US"');
  expect(initialHTML).toContain('aria-label="Map texture"');
  expect(initialHTML).not.toMatch(/[가-힣]|\{\{/);
  for (const [locale, language, touch, width] of [
    ['en-US', 'en', false, 1200], ['ko-KR', 'ko', false, 1200], ['fr-FR', 'en', false, 1200],
    ['en-US', 'en', true, 390], ['ko-KR', 'ko', true, 390],
    ['en-US', 'en', true, 320], ['ko-KR', 'ko', true, 320],
  ] as const) {
    const viewport = { width, height: touch ? 844 : 760 };
    const context = await browser.newContext({ baseURL, locale, viewport, hasTouch: touch });
    await context.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    try {
      const page = await context.newPage();
      await page.goto('/');
      const expected = labels[language];
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', language === 'ko' ? 'ko_KR' : 'en_US');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', language === 'ko' ? /중심을 바꿔/ : /A world map/);
      await expect(page.locator('#texture')).toHaveAttribute('aria-label', expected.texture);
      const download = page.locator('#download');
      await expect(download).toHaveAttribute('aria-label', expected.download);
      await expect(download).toBeDisabled();
      const coordinates = page.locator('#coordinates');
      await expect(coordinates).toHaveAttribute('aria-label', expected.coordinates);
      await expect(coordinates).toBeDisabled();
      const locate = page.locator('#locate');
      await expect(locate).toHaveAttribute('aria-label', expected.locate);
      await expect(locate).toBeDisabled();
      const presets = page.locator('#preset-menu button');
      await expect(presets).toHaveCount(9);
      await expect(page.locator('#preset-menu')).toBeHidden();
      for (const preset of await presets.all()) {
        await expect(preset).toBeDisabled();
      }
      const preset = page.locator('#preset');
      await expect(preset).toBeDisabled();
      await expect(preset).toHaveAttribute('aria-label', language === 'ko' ? '프리셋' : 'Presets');
      const presetBox = (await preset.boundingBox())!;
      const details = page.locator('#map-details');
      await expect(details).toHaveAttribute('aria-label', language === 'ko' ? '국경·지명 표시' : 'Show borders and names');
      await expect(details).toBeDisabled();
      await expect(page.locator('#message')).toHaveText(expected.error);
      const panel = page.getByRole('note', { name: expected.controls, exact: true });
      await expect(panel).toBeVisible();
      const hints = page.locator(touch ? '#help-touch' : '#help-mouse');
      await expect(hints).toBeVisible();
      await expect(hints).toContainText(touch ? expected.touch : expected.mouse);
      await expect(page.locator(touch ? '#help-mouse' : '#help-touch')).toBeHidden();
      const panelBox = (await panel.boundingBox())!;
      const navigationBox = (await page.locator('#navigation-controls').boundingBox())!;
      const coordinatesBox = (await coordinates.boundingBox())!;
      const locateBox = (await locate.boundingBox())!;
      const textureBox = (await page.locator('#texture-control').boundingBox())!;
      const navigationInset = touch ? 16 : 24;
      expect(viewport.width - navigationBox.x - navigationBox.width).toBe(navigationInset);
      expect(navigationBox.y).toBe(navigationInset);
      expect(locateBox.y).toBe(coordinatesBox.y);
      expect(panelBox.x).toBeGreaterThanOrEqual(0);
      expect(panelBox.y).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
      expect(panelBox.x + panelBox.width <= textureBox.x || panelBox.y + panelBox.height <= textureBox.y).toBe(true);
      if (touch) {
        const downloadBox = (await download.boundingBox())!;
        const boxes = [coordinatesBox, locateBox, downloadBox, textureBox, presetBox,
          (await details.boundingBox())!];
        for (const box of boxes) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            expect(a.x + a.width <= b.x || a.y + a.height <= b.y
              || b.x + b.width <= a.x || b.y + b.height <= a.y).toBe(true);
          }
        }
      }
    } finally {
      await context.close();
    }
  }
});
