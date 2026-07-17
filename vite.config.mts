import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { version } from './package.json';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 1024 * 1024,
  },
  plugins: [
    tailwindcss(),
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html: string) {
        return html.replace(/ crossorigin/g, '');
      },
    },
    {
      // sw.js 셸 캐시 버전에 package.json 버전 주입 — 릴리스마다 SW 캐시 자동 무효화
      name: 'sw-cache-version',
      apply: 'build',
      closeBundle() {
        const sw = new URL('./dist/sw.js', import.meta.url);
        const src = readFileSync(sw, 'utf-8');
        if (!src.includes('__APP_VERSION__')) throw new Error('sw.js에 __APP_VERSION__ 플레이스홀더가 없습니다');
        writeFileSync(sw, src.replaceAll('__APP_VERSION__', version));
      },
    },
  ],
});
