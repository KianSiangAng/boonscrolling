/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Emits `sw.js` from `sw/sw.js`, injecting the list of every built file so the whole app
 * (JS, CSS, content packs, map data, icons) is precached on install and works offline.
 */
function serviceWorker(): Plugin {
  return {
    name: 'boonscrolling-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = (
        readdirSync('public', { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[]
      )
        .filter((d) => d.isFile())
        .map((d) => `${d.parentPath}/${d.name}`.replace(/\\/g, '/').replace(/^public\//, ''));
      const files = [...Object.keys(bundle), ...publicFiles].filter((f) => !f.endsWith('.map'));
      const precache = ['./', ...files.map((f) => `./${f}`)].sort();
      const version = `${pkg.version}-${Date.now().toString(36)}`;
      const source = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(precache))
        .replace('self.__VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base: the same build works at username.github.io/<repo>/ or at a domain root.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    // JSON emitted via ?url must stay a file, not a data: URI.
    assetsInlineLimit: (file) => (file.endsWith('.json') ? false : undefined),
  },
  plugins: [serviceWorker()],
  test: {
    environment: 'node',
  },
});
