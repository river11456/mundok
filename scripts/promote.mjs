#!/usr/bin/env node
/**
 * 승격 — 앱에서 내보낸 문헌 JSON(C7)을 카탈로그 정본으로 배치한다 (SPEC 5절).
 *
 *   앱 '내보내기(JSON)' → node scripts/promote.mjs <파일.json> → git 커밋 → 배포
 *
 * 하는 일:
 *   1. 유저 공간 산출물 정리 — source·schemaVersion·updatedAt·editedAt·status 제거
 *      (editedAt이 정본에 남으면 다른 설치자의 업데이트 머지가 전부 '유저 수정'으로 오인)
 *   2. version 부여 — 기존 catalog/<id>.json 있으면 +1 (설치자에게 업데이트 표시), 없으면 1
 *      order는 기존 정본 값을 유지한다 (없으면 내보낸 값)
 *   3. lintDoc 검사 — ERROR 있으면 중단
 *   4. catalog/<id>.json 기록 (2칸 들여쓰기 + 개행)
 *
 * 사용:  node scripts/promote.mjs <내보낸-문헌.json>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lintDoc } from './lint-data.mjs';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(__dirname, '..', 'catalog');

const input = process.argv[2];
if (!input) {
  console.error('사용법: node scripts/promote.mjs <내보낸-문헌.json>');
  process.exit(1);
}

const src = JSON.parse(readFileSync(input, 'utf-8'));
if (typeof src.id !== 'string' || !src.id || typeof src.title !== 'string' || typeof src.levels !== 'object') {
  console.error('문헌 JSON 형식이 아닙니다 (id·title·levels 필요)');
  process.exit(1);
}

const dest = join(CATALOG_DIR, `${src.id}.json`);
const prev = existsSync(dest) ? JSON.parse(readFileSync(dest, 'utf-8')) : null;

// 정본에는 유저 공간 전용 필드를 남기지 않는다
const LEVELS = ['char', 'word', 'sentence', 'paragraph'];
const levels = {};
for (const k of LEVELS) {
  levels[k] = (src.levels[k] ?? []).map(({ editedAt, status, ...card }) => card);
}

const out = {
  id:    src.id,
  title: src.title,
  ...(src.sub !== undefined ? { sub: src.sub } : {}),
  ...(src.color ? { color: src.color } : {}),
  ...((prev?.order ?? src.order) !== undefined ? { order: prev?.order ?? src.order } : {}),
  ...(src.origin ? { origin: src.origin } : {}),
  version: prev ? (prev.version ?? 1) + 1 : 1,
  levels,
};

const { errors, warns } = lintDoc(out);
if (errors.length) {
  console.error(`❌ lint ERROR ${errors.length}건 — 승격 중단:`);
  errors.forEach(e => console.error(`   ${e}`));
  process.exit(1);
}
if (warns.length) console.log(`⚠ WARN ${warns.length}건 (승격은 진행):\n   ${warns.join('\n   ')}`);

writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`✅ catalog/${src.id}.json — version ${out.version}${prev ? ` (이전 ${prev.version ?? 1})` : ' (신규)'}`);
console.log('   다음: node scripts/lint-data.mjs → git 커밋 → 배포');
