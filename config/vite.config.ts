import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Relative asset URLs also work beneath a GitHub Pages repository path.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  plugins: [{
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
