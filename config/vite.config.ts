import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { translations } from '../src/translations.ts';

// Relative asset URLs also work beneath a GitHub Pages repository path.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  plugins: [{
    name: 'default-language',
    transformIndexHtml(html) {
      // Initial HTML and runtime localization share the same translation catalog.
      return html.replace(/\{\{(\w+)\}\}/g, (_, key: keyof typeof translations.en) => {
        const value = translations.en[key];
        if (typeof value !== 'string') throw new Error(`Invalid HTML translation: ${key}`);
        const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return value.replace(/[&<>"']/g, character => entities[character]);
      });
    },
  }, {
    name: 'distribution-notices',
    generateBundle() {
      const notices = { LICENSE: '../LICENSE', 'THIRD_PARTY_NOTICES.md': '../docs/THIRD_PARTY_NOTICES.md' };
      for (const [fileName, path] of Object.entries(notices)) {
        const source = readFileSync(new URL(path, import.meta.url), 'utf8');
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
});
