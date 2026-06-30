#!/usr/bin/env node
/**
 * Phase 1 — CSV + userdata.json → 문헌별 JSON 무손실 변환.
 *
 * docs.ts 의 로더 로직(parseCSV + applyUserData + grammar 병합)을 1:1 복제하여
 * "현재 앱이 보는 DOCS"를 그대로 src/data/<문헌>.json 으로 덤프한다.
 * 같은 PapaParse 파서를 쓰므로 CSV 파싱 차이가 0 → 무손실이 자동 보장된다.
 *
 * 사용:  node scripts/migrate-to-json.mjs          (검증만, 파일 미기록)
 *        node scripts/migrate-to-json.mjs --write  (검증 통과 시 JSON 기록)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Papa from 'papaparse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'src', 'data');
const WRITE    = process.argv.includes('--write');

const LEVEL_ORDER = ['char', 'word', 'sentence', 'paragraph'];
const LEVEL_LABEL = { char: '개별 글자', word: '단어 단위', sentence: '문장 단위', paragraph: '단락 단위' };
const ID_PREFIX   = { char: 'c', word: 'w', sentence: 's', paragraph: 'p' };

// ── docs.ts 와 동일한 CSV 파싱 ───────────────────────────────
function parseCSV(raw) {
  return Papa.parse(raw, { header: true, skipEmptyLines: true }).data;
}

// ── docs.ts: CSV → DOCS (id 없는 canonical 카드) ─────────────
function buildBaseDocs() {
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
  const docs = [];
  for (const file of files) {
    const docId = file.replace(/\.csv$/, '');
    const rows  = parseCSV(readFileSync(join(DATA_DIR, file), 'utf-8'));

    const metaRow = rows.find(r => r['type'] === 'meta');
    if (!metaRow) { console.warn(`[skip] meta 없음: ${file}`); continue; }

    const byType = new Map();
    for (const row of rows.filter(r => r['type'] !== 'meta')) {
      if (!byType.has(row['type'])) byType.set(row['type'], []);
      byType.get(row['type']).push(row);
    }

    const levels = LEVEL_ORDER
      .filter(t => byType.has(t))
      .map(t => ({
        key: t,
        cards: byType.get(t)
          .filter(r => r['text']?.trim())
          .map(r => ({
            front:   r['text']    ?? '',
            reading: r['reading'] ?? '',
            back:    r['meaning'] ?? '',
            note:    r['note']    ?? '',
          })),
      }));

    if (levels.length > 0) docs.push({ id: docId, title: metaRow['text'], sub: metaRow['reading'], levels });
  }
  return docs;
}

// ── docs.ts: applyUserData (deletions → edits → additions) ───
function applyUserData(docs, ud) {
  for (const del of ud.deletions ?? []) {
    const doc = docs.find(d => d.id === del.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) if (lvl.key === del.type) lvl.cards = lvl.cards.filter(c => c.front !== del.text);
  }
  for (const edit of ud.edits ?? []) {
    const doc = docs.find(d => d.id === edit.docId);
    if (!doc) continue;
    for (const lvl of doc.levels) {
      if (lvl.key !== edit.type) continue;
      const card = lvl.cards.find(c => c.front === edit.origText);
      if (card) Object.assign(card, { front: edit.text, reading: edit.reading, back: edit.meaning, note: edit.note });
    }
  }
  for (const add of ud.additions ?? []) {
    const doc = docs.find(d => d.id === add.docId);
    if (!doc) continue;
    if (!LEVEL_ORDER.includes(add.type)) continue;
    let lvl = doc.levels.find(l => l.key === add.type);
    if (!lvl) {
      lvl = { key: add.type, cards: [] };
      const idx = LEVEL_ORDER.indexOf(add.type);
      const at  = doc.levels.findIndex(l => LEVEL_ORDER.indexOf(l.key) > idx);
      if (at === -1) doc.levels.push(lvl); else doc.levels.splice(at, 0, lvl);
    }
    if (!lvl.cards.some(c => c.front === add.text))
      lvl.cards.push({ front: add.text, reading: add.reading, back: add.meaning, note: add.note });
  }
}

// ── 최종 canonical DOCS = 현재 앱이 보는 콘텐츠 ───────────────
function buildCanonical() {
  const docs = buildBaseDocs();
  const ud   = JSON.parse(readFileSync(join(ROOT, 'userdata.json'), 'utf-8'));
  applyUserData(docs, ud);
  // grammar: docId+cardFront 로 카드를 찾아 내장
  const grammarByDoc = new Map();
  for (const g of ud.grammar ?? []) {
    if (!grammarByDoc.has(g.docId)) grammarByDoc.set(g.docId, []);
    grammarByDoc.get(g.docId).push(g);
  }
  return { docs, grammarByDoc };
}

// ── canonical → DocJSON (안정 id 부여 + grammar 내장) ────────
//   문법 주석은 sentence 레벨 카드에만 매핑한다(문법 편집은 sentence 전용).
//   live grammar 만 넘어오므로 find 는 항상 매칭된다.
function toDocJSON(doc, liveGrammar) {
  const levels = {};
  for (const lvl of doc.levels) {
    const prefix = ID_PREFIX[lvl.key];
    levels[lvl.key] = lvl.cards.map((c, i) => {
      const card = { id: `${prefix}${i + 1}`, text: c.front, reading: c.reading, meaning: c.back, note: c.note };
      if (lvl.key === 'sentence') {
        const g = liveGrammar?.find(e => e.cardFront === c.front);
        if (g && g.annotations?.length) card.grammar = g.annotations;
      }
      return card;
    });
  }
  return { id: doc.id, title: doc.title, sub: doc.sub, levels };
}

// ── DocJSON → canonical (왕복 무결성 검증용 역변환) ──────────
function fromDocJSON(dj) {
  const levels = LEVEL_ORDER
    .filter(k => dj.levels[k])
    .map(k => ({ key: k, cards: dj.levels[k].map(c => ({ front: c.text, reading: c.reading, back: c.meaning, note: c.note })) }));
  const grammar = [];
  for (const c of dj.levels.sentence ?? []) if (c.grammar) grammar.push({ cardFront: c.text, annotations: c.grammar });
  return { doc: { id: dj.id, title: dj.title, sub: dj.sub, levels }, grammar };
}

// ── 비교 ────────────────────────────────────────────────────
function cardsEqual(a, b) {
  return a.front === b.front && a.reading === b.reading && a.back === b.back && a.note === b.note;
}
function diffDoc(orig, round, grammarOrig, grammarRound) {
  const errs = [];
  if (orig.title !== round.title) errs.push(`title: "${orig.title}" ≠ "${round.title}"`);
  if (orig.sub   !== round.sub)   errs.push(`sub: "${orig.sub}" ≠ "${round.sub}"`);
  const keysO = orig.levels.map(l => l.key).join(',');
  const keysR = round.levels.map(l => l.key).join(',');
  if (keysO !== keysR) errs.push(`levels: [${keysO}] ≠ [${keysR}]`);
  for (const lo of orig.levels) {
    const lr = round.levels.find(l => l.key === lo.key);
    if (!lr) { errs.push(`level ${lo.key} 누락`); continue; }
    if (lo.cards.length !== lr.cards.length) errs.push(`${lo.key} 카드수 ${lo.cards.length} ≠ ${lr.cards.length}`);
    for (let i = 0; i < lo.cards.length; i++)
      if (!lr.cards[i] || !cardsEqual(lo.cards[i], lr.cards[i]))
        errs.push(`${lo.key}[${i}] 불일치: "${lo.cards[i].front}"`);
  }
  // grammar 비교 (cardFront → 직렬화)
  const gKey = arr => JSON.stringify((arr ?? []).map(g => [g.cardFront, g.annotations]).sort());
  if (gKey(grammarOrig) !== gKey(grammarRound)) errs.push(`grammar 불일치`);
  return errs;
}

// ── main ────────────────────────────────────────────────────
const { docs, grammarByDoc } = buildCanonical();
let totalCards = 0, totalLive = 0, failed = 0;
const orphans = [];   // 이미 깨진(현재 카드와 cardFront 불일치) grammar — 변환에서 제외

console.log(`\n문헌 ${docs.length}개 변환 검증:\n`);
const outputs = [];
for (const doc of docs) {
  const gEntries  = grammarByDoc.get(doc.id) ?? [];
  const sentCards = doc.levels.find(l => l.key === 'sentence')?.cards ?? [];
  const sentFronts = new Set(sentCards.map(c => c.front));
  const live   = gEntries.filter(g => sentFronts.has(g.cardFront));
  const orphan = gEntries.filter(g => !sentFronts.has(g.cardFront));
  orphan.forEach(o => orphans.push({ docId: doc.id, cardFront: o.cardFront }));

  const dj    = toDocJSON(doc, live);
  const round = fromDocJSON(dj);
  const errs  = diffDoc(doc, round.doc, live, round.grammar);

  const nCards = Object.values(dj.levels).reduce((s, a) => s + a.length, 0);
  totalCards += nCards; totalLive += live.length;

  if (errs.length) { failed++; console.log(`  ✗ ${doc.id}: ${errs.length}건 불일치`); errs.slice(0, 5).forEach(e => console.log(`      - ${e}`)); }
  else console.log(`  ✓ ${doc.id.padEnd(12)} 카드 ${String(nCards).padStart(3)}장, 문법 ${live.length}건${orphan.length ? `  (고아 ${orphan.length}건 제외)` : ''}`);

  outputs.push({ path: join(DATA_DIR, `${doc.id}.json`), dj });
}

let gTotal = 0; for (const arr of grammarByDoc.values()) gTotal += arr.length;
console.log(`\n합계: 카드 ${totalCards}장, 문법 ${totalLive}건 변환 (전체 ${gTotal}건 중 고아 ${orphans.length}건 제외)`);

if (orphans.length) {
  console.log(`\n⚠ 이미 깨진 문법 주석 ${orphans.length}건 — 현재 앱에서도 표시되지 않는 죽은 데이터(텍스트 수정으로 cardFront 고아화):`);
  orphans.forEach(o => console.log(`    · ${o.docId}: "${o.cardFront.slice(0, 30)}…"`));
  console.log(`  → 무손실 변환(=현재 상태 보존) 원칙에 따라 제외함. 복구는 Phase 1 이후 별도 진행 가능.`);
}

if (failed > 0) { console.log(`\n❌ 검증 실패 ${failed}건 — JSON 기록하지 않음.\n`); process.exit(1); }
console.log(`\n✅ 무손실 검증 통과 (살아있는 콘텐츠 100% 일치).`);

if (WRITE) {
  for (const { path, dj } of outputs) writeFileSync(path, JSON.stringify(dj, null, 2) + '\n', 'utf-8');
  console.log(`📝 ${outputs.length}개 JSON 기록 완료 → src/data/*.json\n`);
} else {
  console.log(`ℹ️  --write 없이 실행됨: 검증만 수행, 파일 미기록.\n`);
}
