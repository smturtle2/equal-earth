import { test, expect } from '@playwright/test';

const labels = {
  en: { controls: 'Controls', texture: 'Map texture', error: 'Open this map in a browser with WebGPU enabled.', mouse: /Drag to rotate/, touch: /Two fingers to zoom & roll/ },
  ko: { controls: '조작법', texture: '지도 텍스처', error: 'WebGPU를 사용할 수 있는 브라우저에서 열어 주세요.', mouse: /드래그 회전/, touch: /두 손가락으로 확대·비틀기/ },
};

test('localizes concise help and errors, falls back to English, and fits touch layouts', async ({ browser, baseURL }) => {
  for (const [locale, language, touch] of [
    ['en-US', 'en', false], ['ko-KR', 'ko', false], ['fr-FR', 'en', false],
    ['en-US', 'en', true], ['ko-KR', 'ko', true],
  ] as const) {
    const viewport = touch ? { width: 390, height: 844 } : { width: 1200, height: 760 };
    const context = await browser.newContext({ baseURL, locale, viewport, hasTouch: touch });
    await context.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    try {
      const page = await context.newPage();
      await page.goto('/');
      const expected = labels[language];
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('#texture')).toHaveAttribute('aria-label', expected.texture);
      await expect(page.locator('#message')).toHaveText(expected.error);
      const panel = page.getByRole('note', { name: expected.controls, exact: true });
      await expect(panel).toBeVisible();
      const hints = page.locator(touch ? '#help-touch' : '#help-mouse');
      await expect(hints).toBeVisible();
      await expect(hints).toContainText(touch ? expected.touch : expected.mouse);
      await expect(page.locator(touch ? '#help-mouse' : '#help-touch')).toBeHidden();
      const panelBox = (await panel.boundingBox())!;
      const textureBox = (await page.locator('#texture-control').boundingBox())!;
      expect(panelBox.x).toBeGreaterThanOrEqual(0);
      expect(panelBox.y).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
      expect(panelBox.x + panelBox.width <= textureBox.x || panelBox.y + panelBox.height <= textureBox.y).toBe(true);
    } finally {
      await context.close();
    }
  }
});
