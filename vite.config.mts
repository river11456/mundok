import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
      // 문헌 카탈로그 — catalog/*.json을 dist/catalog/로 복사 + index.json 생성.
      // 앱과 같은 origin에 배포돼 별도 서버 없이 "문헌 받기"가 동작한다.
      name: 'build-catalog',
      apply: 'build',
      closeBundle() {
        const srcDir = new URL('./catalog/', import.meta.url);
        const outDir = new URL('./dist/catalog/', import.meta.url);
        mkdirSync(outDir, { recursive: true });
        const docs: object[] = [];
        const files = existsSync(srcDir)
          ? readdirSync(srcDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
          : [];
        // order 필드 우선(작을수록 앞, 없으면 맨 뒤) → 동률은 id 가나다순 (src/docs.ts 정렬과 동일 패턴)
        const entries = files
          .map(f => ({ f, dj: JSON.parse(readFileSync(new URL(f, srcDir), 'utf-8')) }))
          .sort((a, b) => (a.dj.order ?? Infinity) - (b.dj.order ?? Infinity) || a.dj.id.localeCompare(b.dj.id));
        for (const { f, dj } of entries) {
          copyFileSync(new URL(f, srcDir), new URL(f, outDir));
          let cards = 0;
          for (const arr of Object.values(dj.levels ?? {})) cards += (arr as unknown[]).length;
          docs.push({ id: dj.id, title: dj.title, sub: dj.sub, color: dj.color, version: dj.version ?? 1, cards });
        }
        writeFileSync(new URL('index.json', outDir), JSON.stringify({ docs }, null, 2) + '\n');
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
