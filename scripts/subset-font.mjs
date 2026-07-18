#!/usr/bin/env node
/**
 * WenKai(해서) 서브셋 생성 — 콘텐츠 한자만 뽑아 self-host용 woff2를 만든다.
 *
 * 대상 글자: lint-data.mjs 의 collectHanChars() (전 레벨 카드 text + title + sub + 워드마크)
 * 원본 폰트: LXGW WenKai TC Regular (OFL-1.1) — .fontcache/ 에 없으면 GitHub 릴리스에서 다운로드
 * 산출물(커밋 대상):
 *   public/fonts/wenkai-tc-sub.woff2        — index.html @font-face 가 참조
 *   public/fonts/wenkai-tc-sub.chars.txt    — 실제 포함 글자 목록 (lint 커버리지 검사가 읽음)
 *   public/fonts/wenkai-tc-sub.missing.txt  — 원본 폰트 자체에 없는 글자 (있을 때만 생성; 명조 폴백 대상)
 *
 * 원본에 없는 글리프는 subset-font(harfbuzz)가 조용히 누락시키므로, cmap을 직접 검사해
 * (font-cmap.mjs) 결측을 빌드 시점에 드러낸다 — 해당 글자는 .hanja 폴백 사슬의 명조가 받는다.
 *
 * 사용:  npm run font:subset   (새 문헌·글자 추가로 lint 폰트 WARN이 나오면 재실행)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import subsetFont from 'subset-font';
import { collectHanChars } from './lint-data.mjs';
import { readCmapCoverage } from './font-cmap.mjs';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const DATA_DIR   = join(ROOT, 'src', 'data');
const CACHE_DIR  = join(ROOT, '.fontcache');
const OUT_DIR    = join(ROOT, 'public', 'fonts');
const SRC_TTF    = join(CACHE_DIR, 'LXGWWenKaiTC-Regular.ttf');
const SRC_URL    = 'https://github.com/lxgw/LxgwWenkaiTC/releases/latest/download/LXGWWenKaiTC-Regular.ttf';
const OUT_WOFF2   = join(OUT_DIR, 'wenkai-tc-sub.woff2');
const OUT_CHARS   = join(OUT_DIR, 'wenkai-tc-sub.chars.txt');
const OUT_MISSING = join(OUT_DIR, 'wenkai-tc-sub.missing.txt');

const djs = readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort()
  .map(f => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8')));
const wanted = [...collectHanChars(djs)].sort();

if (!existsSync(SRC_TTF)) {
  console.log(`원본 폰트 다운로드 중… ${SRC_URL}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`다운로드 실패 HTTP ${res.status}`);
  writeFileSync(SRC_TTF, Buffer.from(await res.arrayBuffer()));
}

const original = readFileSync(SRC_TTF);
const coverage = readCmapCoverage(original);
const missing  = wanted.filter(c => !coverage.has(c.codePointAt(0)));
const chars    = wanted.filter(c =>  coverage.has(c.codePointAt(0))).join('');
const woff2 = await subsetFont(original, chars, { targetFormat: 'woff2' });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_WOFF2, woff2);
writeFileSync(OUT_CHARS, chars);
if (missing.length) {
  writeFileSync(OUT_MISSING, missing.join(''));
  console.warn(`⚠ 원본 폰트 미지원 한자 ${missing.length}자 "${missing.join('')}" → 명조(Noto Serif TC) 폴백으로 표시됨`);
  console.warn(`  ${OUT_MISSING.replace(ROOT + '/', '')} 기록 — lint가 이 목록으로 안내한다`);
} else if (existsSync(OUT_MISSING)) {
  unlinkSync(OUT_MISSING);
}

console.log(`서브셋 완료: 한자 ${[...chars].length}자${missing.length ? ` (원본 미지원 ${missing.length}자 제외)` : ''}`);
console.log(`  ${OUT_WOFF2.replace(ROOT + '/', '')}  ${(woff2.length / 1024).toFixed(1)}KB (원본 ${(original.length / 1024 / 1024).toFixed(1)}MB)`);
console.log(`  ${OUT_CHARS.replace(ROOT + '/', '')}`);
