import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Relative asset URLs also work beneath a GitHub Pages repository path.
export default defineConfig({
  base: './',
  plugins: [{
    name: 'distribution-notices',
    generateBundle() {
      for (const fileName of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(fileName, import.meta.url), 'utf8') });
      }
    },
  }],
});
