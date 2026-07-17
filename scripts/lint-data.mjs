#!/usr/bin/env node
/**
 * 콘텐츠 무결성 lint — src/data/*.json 을 검사한다.
 *
 *  ERROR (빌드 차단): 데이터가 잘못된 것
 *   - 카드 id 중복 (문헌 내)
 *   - drill 링크가 존재하지 않는 카드 id 를 가리킴
 *   - 문법 주석 인덱스가 범위를 벗어남 (start<end, 0..len)
 *  WARN (정보): 잠재적 모호성
 *   - 같은 레벨 내 중복 텍스트 (edit/delete 가 양쪽에 적용될 수 있음)
 *   - 드릴다운 자동매칭 후보가 0인 문장/단락 (밑줄이 안 생김)
 *
 * 사용:  node scripts/lint-data.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'src', 'data');
const LEVEL_ORDER = ['char', 'word', 'sentence', 'paragraph'];
// render.ts 의 드릴 경로와 일치
const DRILL_LEVELS = { paragraph: ['sentence'], sentence: ['word', 'char'], word: ['char'] };

function trunc(s) { return s.length > 28 ? s.slice(0, 28) + '…' : s; }

/** 홈 워드마크 — 콘텐츠 밖이지만 해서(WenKai)로 표시되므로 서브셋에 포함해야 한다. */
export const WORDMARK = '文讀';

/**
 * 문헌들에서 해서(WenKai) 서브셋에 필요한 한자 전체를 모은다 (Set).
 * 대상: 전 레벨 카드 text + title + sub + 워드마크. (뜻·독음은 한글 = 고딕 사슬 담당)
 * 서브셋 생성(scripts/subset-font.mjs)과 커버리지 lint가 같은 로직을 공유한다.
 */
export function collectHanChars(djs) {
  const out = new Set();
  const add = (s) => { for (const ch of s ?? '') if (/\p{Script=Han}/u.test(ch)) out.add(ch); };
  add(WORDMARK);
  for (const dj of djs) {
    add(dj.title);
    add(dj.sub);
    for (const k of LEVEL_ORDER) for (const c of dj.levels[k] ?? []) add(c.text);
  }
  return out;
}

/** 서브셋(chars 문자열/Set)에 없는 콘텐츠 한자 목록. 비면 커버리지 완전. */
export function missingHanChars(djs, subsetChars) {
  const have = new Set(subsetChars);
  return [...collectHanChars(djs)].filter(ch => !have.has(ch));
}

/** 문헌(DocJSON) 1개를 검사해 { errors, warns } 를 반환한다. (순수 함수 — 테스트 용이) */
export function lintDoc(dj) {
  const docId  = dj.id;
  const errors = [];
  const warns  = [];

  // order 필드 (홈 화면 정렬) — 있으면 숫자여야 함
  if (dj.order !== undefined && typeof dj.order !== 'number') {
    errors.push(`${docId}: order 필드가 숫자가 아님 (${JSON.stringify(dj.order)})`);
  }

  // 문헌 내 전체 카드 id 집합 (drill 무결성용)
  const allIds = new Set();
  for (const k of LEVEL_ORDER) for (const c of dj.levels[k] ?? []) allIds.add(c.id);

  for (const k of LEVEL_ORDER) {
    const cards = dj.levels[k] ?? [];
    const seenId   = new Map();
    const seenText = new Map();

    for (const c of cards) {
      // id 중복
      if (seenId.has(c.id)) errors.push(`${docId}/${k}: 카드 id 중복 "${c.id}"`);
      else seenId.set(c.id, c.text);

      // 같은 레벨 텍스트 중복
      if (seenText.has(c.text)) warns.push(`${docId}/${k}: 중복 텍스트 "${trunc(c.text)}" (${seenText.get(c.text)} = ${c.id})`);
      else seenText.set(c.text, c.id);

      // 문법 인덱스 범위
      if (c.grammar) {
        const len = [...c.text].length;
        for (const g of c.grammar) {
          const ok = Number.isInteger(g.start) && Number.isInteger(g.end)
            && g.start >= 0 && g.start < g.end && g.end <= len;
          if (!ok) errors.push(`${docId}/${k} "${c.id}": 문법 인덱스 범위 이상 start=${g.start} end=${g.end} (len=${len})`);
        }
      }

      // drill 링크 무결성
      if (c.drill) for (const d of c.drill) if (!allIds.has(d)) errors.push(`${docId}/${k} "${c.id}": drill 링크 깨짐 → "${d}" 없음`);
    }

    // 드릴다운 자동매칭 0건 — sentence/paragraph 만 검사.
    //   (word→char 드릴은 선택적이라 0건이 정상 → 노이즈로 제외)
    const nextKeys = (k === 'sentence' || k === 'paragraph') ? DRILL_LEVELS[k] : null;
    if (nextKeys) {
      const candidates = nextKeys.flatMap(nk => (dj.levels[nk] ?? []));
      for (const c of cards) {
        const hit = candidates.some(cand => cand.text && c.text.includes(cand.text));
        if (!hit) warns.push(`${docId}/${k} "${c.id}": 드릴다운 매칭 0건 "${trunc(c.text)}"`);
      }
    }
  }

  return { errors, warns };
}

// CLI로 직접 실행됐을 때만 실제 파일을 읽어 검사 + 출력 (모듈로 import 될 땐 부작용 없음)
// 한글 등 비ASCII 경로는 file:// URL이 percent-encoding되므로 fileURLToPath로 디코딩해 비교한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const errors = [];
  const warns  = [];

  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  const djs   = [];
  for (const file of files) {
    const dj = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
    djs.push(dj);
    const { errors: e, warns: w } = lintDoc(dj);
    errors.push(...e);
    warns.push(...w);
  }

  // 폰트 커버리지 — 콘텐츠 한자가 self-host WenKai 서브셋에 전부 있는지 (없으면 해당 글자만 고딕 폴백)
  const manifestPath = join(__dirname, '..', 'public', 'fonts', 'wenkai-tc-sub.chars.txt');
  try {
    const subsetChars = readFileSync(manifestPath, 'utf-8');
    const missing = missingHanChars(djs, subsetChars);
    if (missing.length) {
      warns.push(`폰트: WenKai 서브셋에 없는 한자 ${missing.length}자 "${trunc(missing.join(''))}" → npm run font:subset 재실행`);
    }
  } catch {
    warns.push('폰트: WenKai 서브셋 미생성 (public/fonts/) → npm run font:subset 실행');
  }

  console.log(`\n콘텐츠 lint — 문헌 ${files.length}개\n`);
  if (errors.length) {
    console.log(`❌ ERROR ${errors.length}건:`);
    errors.forEach(e => console.log(`   ${e}`));
  } else {
    console.log(`✅ ERROR 0건 (id 중복·drill 깨짐·문법 범위 모두 정상)`);
  }

  console.log('');
  if (warns.length) {
    // 종류별 카운트 요약
    const dup  = warns.filter(w => w.includes('중복 텍스트')).length;
    const miss = warns.filter(w => w.includes('드릴다운 매칭 0건')).length;
    const font = warns.filter(w => w.startsWith('폰트:')).length;
    console.log(`⚠ WARN ${warns.length}건  (중복 텍스트 ${dup}, 드릴다운 0건 ${miss}, 폰트 ${font})`);
    warns.forEach(w => console.log(`   ${w}`));
  } else {
    console.log(`✅ WARN 0건`);
  }

  console.log('');
  process.exit(errors.length > 0 ? 1 : 0);
}
