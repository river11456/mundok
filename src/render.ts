import { S, curDoc, DOCS, DRILL_LEVELS, getDocLastStudied, recordStudySession } from './state';
import { hideBubble } from './addcard';

const $app = (): HTMLElement => document.getElementById('app')!;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type CardStyle = { wrap: string; front: string; backAlign: string };

function cardStyle(key: string): CardStyle {
  switch (key) {
    case 'char':
      return { wrap: 'max-w-2xl',  front: 'hanja text-8xl tracking-widest text-center', backAlign: 'text-center' };
    case 'word':
      return { wrap: 'max-w-2xl',  front: 'hanja text-5xl tracking-wide text-center',   backAlign: 'text-center' };
    case 'sentence':
      return { wrap: 'max-w-4xl', front: 'hanja text-2xl leading-[2.2] tracking-wide text-left',  backAlign: 'text-left' };
    case 'paragraph':
      return { wrap: 'max-w-5xl', front: 'hanja text-xl leading-[2.2] tracking-wide text-left',   backAlign: 'text-left' };
    default:
      return { wrap: 'max-w-2xl',  front: 'hanja text-5xl tracking-wide text-center',   backAlign: 'text-center' };
  }
}

let _prevScr = '';

export function render(): void {
  hideBubble();
  document.body.classList.toggle('anki-mode', S.mode === 'anki');
  const entering = S.scr !== _prevScr;
  _prevScr = S.scr;
  switch (S.scr) {
    case 'home':  renderHome();           break;
    case 'mode':  renderMode();           break;
    case 'level': renderLevel();          break;
    case 'study':
      if (S.mode === 'seq') renderSeq(entering);
      else renderAnki(entering);
      break;
  }
}



function tokenizeHighlights(text: string): string {
  if (!S.lv) return esc(text);
  const nextKeys = DRILL_LEVELS[S.lv.key];
  if (!nextKeys) return esc(text);

  const doc = curDoc();
  const candidates = nextKeys
    .flatMap(key => (doc.levels.find(l => l.key === key)?.cards ?? []).filter(c => text.includes(c.front)));
  if (candidates.length === 0) return esc(text);

  candidates.sort((a, b) => b.front.length - a.front.length);

  type Span = { start: number; end: number; id: string; front: string; back: string };
  const spans: Span[] = [];

  for (const card of candidates) {
    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(card.front, pos);
      if (idx === -1) break;
      const end = idx + card.front.length;
      if (!spans.some(s => idx < s.end && end > s.start)) {
        spans.push({ start: idx, end, id: card.id, front: card.front, back: card.back });
      }
      pos = idx + 1;
    }
  }

  if (spans.length === 0) return esc(text);
  spans.sort((a, b) => a.start - b.start);

  let html = '';
  let pos  = 0;
  for (const sp of spans) {
    html += esc(text.slice(pos, sp.start));
    html += `<span data-action="drill-down" data-arg="${esc(sp.id)}" title="${esc(sp.back)}"
      class="border-b-2 border-stone-300 cursor-pointer hover:bg-amber-50 hover:border-amber-500 transition-colors"
      >${esc(sp.front)}</span>`;
    pos = sp.end;
  }
  html += esc(text.slice(pos));
  return html;
}

function backBtn(label: string): string {
  return `<button data-action="nav-back"
    class="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors">
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    ${esc(label)}
  </button>`;
}

function homeBtn(): string {
  return `<button data-action="nav-home"
    class="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors">
    <svg width="13" height="13" viewBox="0 0 11 11" fill="currentColor">
      <path d="M5.5 1L0.5 5.5H2V10H4.5V7H6.5V10H9V5.5H10.5L5.5 1Z"/>
    </svg>
    홈
  </button>`;
}

function annotatedFront(front: string, reading: string): string {
  // Build drill-down match map (same logic as tokenizeHighlights)
  type M = { id: string; back: string; len: number };
  const matchMap = new Map<number, M>();
  const nextKeys = S.lv ? DRILL_LEVELS[S.lv.key] : null;
  if (nextKeys) {
    const doc = curDoc();
    const candidates = nextKeys
      .flatMap(key => (doc.levels.find(l => l.key === key)?.cards ?? []).filter(c => front.includes(c.front)));
    candidates.sort((a, b) => b.front.length - a.front.length);
    const covered = new Set<number>();
    for (const card of candidates) {
      let p = 0;
      while (p < front.length) {
        const idx = front.indexOf(card.front, p);
        if (idx === -1) break;
        const end = idx + card.front.length;
        if (![...card.front].some((_, k) => covered.has(idx + k))) {
          matchMap.set(idx, { id: card.id, back: card.back, len: card.front.length });
          for (let k = idx; k < end; k++) covered.add(k);
        }
        p = idx + 1;
      }
    }
  }

  const charSpan = (ch: string, rd: string) =>
    `<ruby>${esc(ch)}<rt style="font-size:12px;font-family:'Noto Sans KR',sans-serif;color:#a8a29e">${esc(rd)}</rt></ruby>`;

  let html = '';
  let i = 0;
  while (i < front.length) {
    const m = matchMap.get(i);
    if (m) {
      const inner = [...front.slice(i, i + m.len)].map((ch, j) => charSpan(ch, reading[i + j])).join('');
      html += `<span data-action="drill-down" data-arg="${esc(m.id)}" title="${esc(m.back)}" class="inline-block border-b-2 border-stone-300 cursor-pointer hover:bg-amber-50 hover:border-amber-500 transition-colors">${inner}</span>`;
      i += m.len;
    } else {
      html += charSpan(front[i], reading[i]);
      i++;
    }
  }
  return html;
}

function cardBack(card: { reading: string; back: string; note: string }, cs: CardStyle, showReading = true): string {
  return `
    <div class="border-t border-stone-100 pt-6 flex flex-col gap-3">
      ${showReading && card.reading ? `<div class="text-xl text-stone-700 ${cs.backAlign}">${esc(card.reading)}</div>` : ''}
      ${card.back    ? `<div class="text-base text-stone-600 ${cs.backAlign} leading-relaxed">${esc(card.back)}</div>` : ''}
      ${card.note    ? `<div class="text-sm text-stone-400 ${cs.backAlign} leading-relaxed border-t border-stone-100 pt-3">${esc(card.note)}</div>` : ''}
    </div>`;
}

function cardActions(): string {
  return `
  <div class="absolute top-4 right-4 flex gap-1">
    <button data-action="edit-card"
      class="p-2 text-stone-200 hover:text-blue-400 hover:bg-blue-50 transition-colors rounded-lg"
      title="카드 수정">
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
        <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button data-action="delete-card"
      class="p-2 text-stone-200 hover:text-red-400 hover:bg-red-50 transition-colors rounded-lg"
      title="카드 삭제">
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 4H11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M5 4V3C5 2.4 5.4 2 6 2H8C8.6 2 9 2.4 9 3V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M4 4L4.5 11.5H9.5L10 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>`;
}

function renderHome(): void {
  const items = DOCS.map((d) => {
    const totalCards  = d.levels.reduce((s, l) => s + l.cards.length, 0);
    const lastStudied = getDocLastStudied(d.id);
    const bgChar      = esc(d.title[0] ?? '');
    return `
    <button data-action="nav-mode" data-arg="${d.id}"
      class="relative w-full text-left px-7 py-6 bg-white border border-stone-200 rounded-2xl hover:border-stone-400 hover:shadow-md transition-all group overflow-hidden">
      <div class="absolute right-4 bottom-0 hanja leading-none select-none pointer-events-none
                  text-[88px] text-stone-100 group-hover:text-stone-200 transition-colors">
        ${bgChar}
      </div>
      <div class="relative">
        <div class="hanja text-lg text-stone-900">${esc(d.title)}</div>
        <div class="text-sm text-stone-400 mt-0.5">${esc(d.sub)}</div>
        <div class="flex items-center gap-2 mt-3">
          <span class="text-xs text-stone-300">${totalCards}장</span>
          ${lastStudied ? `<span class="text-xs text-stone-300">·</span><span class="text-xs text-stone-400">최근 학습 ${lastStudied}</span>` : ''}
        </div>
      </div>
    </button>`;
  }).join('');

  $app().innerHTML = `
    <div class="screen-enter w-full max-w-lg flex flex-col gap-8">
      <div class="pt-6 pb-2">
        <div class="hanja text-5xl tracking-widest text-stone-900">文讀</div>
        <div class="text-sm text-stone-400 mt-2 tracking-wide">한의학 한문 학습</div>
      </div>
      <div class="stagger flex flex-col gap-3">${items}</div>
      <div class="flex flex-col gap-1 pb-2">
        <div class="text-xs text-stone-300 leading-relaxed">모든 해석은 한의예과 1-1 써머리 기준으로 작성되었습니다. 생성형 AI가 편집에 참여하였으므로 일부 내용이 부정확할 수 있습니다. 공부하면서 직접 확인하고 수정하며 사용하세요.</div>
        <div class="text-xs text-stone-300 tracking-wide mt-1">v1.0.0 · KJH</div>
      </div>
    </div>`;
}

function renderMode(): void {
  const d = curDoc();
  $app().innerHTML = `
    <div class="screen-enter w-full max-w-lg flex flex-col gap-10">
      <div class="flex items-center justify-between">
        ${backBtn('목록')}
        ${homeBtn()}
      </div>
      <div class="text-center">
        <div class="hanja text-2xl text-stone-900">${esc(d.title)}</div>
        <div class="text-sm text-stone-400 mt-1">${esc(d.sub)}</div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <button data-action="nav-level" data-arg="seq"
          class="p-8 bg-white border border-stone-200 rounded-2xl hover:border-stone-400 hover:shadow-sm transition-all text-left">
          <div class="text-3xl text-stone-300 mb-4">→</div>
          <div class="text-base font-bold text-stone-900">순차 재생</div>
          <div class="text-sm text-stone-400 mt-1.5 leading-relaxed">전체를 순서대로</div>
          <div class="text-xs text-stone-300 mt-4">Space · ← →</div>
        </button>
        <button data-action="nav-level" data-arg="anki"
          class="p-8 bg-white border border-stone-200 rounded-2xl hover:border-stone-400 hover:shadow-sm transition-all text-left">
          <div class="text-3xl text-stone-300 mb-4">↺</div>
          <div class="text-base font-bold text-stone-900">안키 모드</div>
          <div class="text-sm text-stone-400 mt-1.5 leading-relaxed">모르는 것 집중 반복</div>
          <div class="text-xs text-stone-300 mt-4">Space · 1 · 2 · 3</div>
        </button>
      </div>
    </div>`;
}

function renderLevel(): void {
  const d = curDoc();
  const modeLabel = S.mode === 'seq' ? '순차 재생' : '안키 모드';
  const rows = d.levels.map((lv, i) => `
    <button data-action="start-study" data-arg="${i}"
      class="w-full text-left px-7 py-5 bg-white border border-stone-200 rounded-2xl hover:border-stone-400 hover:shadow-sm transition-all group">
      <div class="flex items-center justify-between">
        <div class="text-base font-bold text-stone-900">${esc(lv.label)}</div>
        <div class="flex items-center gap-4">
          <span class="text-sm text-stone-400">${lv.cards.length}장</span>
          <svg class="w-5 h-5 text-stone-300 group-hover:text-stone-500 transition-colors" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    </button>`).join('');

  $app().innerHTML = `
    <div class="screen-enter w-full max-w-lg flex flex-col gap-10">
      <div class="flex items-center justify-between">
        ${backBtn(modeLabel)}
        ${homeBtn()}
      </div>
      <div class="text-center">
        <div class="text-sm text-stone-400"><span class="hanja">${esc(d.title)}</span> · ${modeLabel}</div>
        <div class="text-xl font-bold text-stone-900 mt-1">단위 선택</div>
      </div>
      <div class="flex flex-col gap-3">${rows}</div>
    </div>`;
}

function renderSeq(entering = false): void {
  const cards     = S.lv!.cards;
  const card      = cards[S.seqIdx];
  const d         = curDoc();
  const pct       = ((S.seqIdx + 1) / cards.length) * 100;
  const cs        = cardStyle(S.lv!.key);
  const prevEntry = S.navStack.length > 0 ? S.navStack[S.navStack.length - 1] : null;
  const backLabel = prevEntry ? prevEntry.lv.label : `${d.title} / ${S.lv!.label}`;

  $app().innerHTML = `
    <div class="${entering ? 'screen-enter ' : ''}w-full ${cs.wrap} flex flex-col gap-6">
      <div class="flex items-center justify-between">
        ${backBtn(backLabel)}
        <div class="flex items-center gap-4">
          ${homeBtn()}
          <span class="text-sm text-stone-400 tabular-nums">${S.seqIdx + 1} / ${cards.length}</span>
        </div>
      </div>

      <div class="w-full h-0.5 bg-stone-200 rounded-full overflow-hidden">
        <div class="h-full bg-stone-800 rounded-full transition-all duration-300" style="width:${pct}%"></div>
      </div>

      <div class="relative bg-white border border-stone-200 rounded-2xl shadow-sm flex flex-col gap-6 py-14 px-16 min-h-[380px] justify-center">
        ${cardActions()}
        <div id="card-front" class="${cs.front} text-stone-900">
          ${S.seqFlipped && card.front.length === card.reading.length && card.reading
            ? annotatedFront(card.front, card.reading)
            : tokenizeHighlights(card.front)}
        </div>
        ${S.seqFlipped ? cardBack(card, cs, !(card.front.length === card.reading.length && card.reading)) : `
          <div class="text-sm text-stone-300 text-center">Space 키로 정답 보기</div>`}
      </div>

      <div class="flex justify-between items-center">
        <button data-action="seq-prev"
          class="px-6 py-3 text-sm border border-stone-200 rounded-xl text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-all ${S.seqIdx === 0 ? 'opacity-30 pointer-events-none' : ''}">
          ← 이전
        </button>
        <span class="text-sm text-stone-300">Space</span>
        <button data-action="seq-next"
          class="px-6 py-3 text-sm border border-stone-200 rounded-xl text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-all ${S.seqIdx === cards.length - 1 ? 'opacity-30 pointer-events-none' : ''}">
          다음 →
        </button>
      </div>
    </div>`;
}

function renderAnki(entering = false): void {
  if (S.side === 'result') { renderResult(); return; }

  const card = S.queue[0];
  const done = S.total - S.queue.length;
  const pct  = Math.round((done / S.total) * 100);
  const d    = curDoc();

  const ratingBtns = `
    <div class="flex gap-3 w-full">
      <button data-action="anki-rate" data-arg="1"
        class="flex-1 py-4 text-sm font-medium border border-red-200 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors">
        1&nbsp;&nbsp;어려움
      </button>
      <button data-action="anki-rate" data-arg="2"
        class="flex-1 py-4 text-sm font-medium border border-amber-200 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors">
        2&nbsp;&nbsp;보통
      </button>
      <button data-action="anki-rate" data-arg="3"
        class="flex-1 py-4 text-sm font-medium border border-green-200 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors">
        3&nbsp;&nbsp;쉬움
      </button>
    </div>`;

  const cs = cardStyle(S.lv!.key);

  $app().innerHTML = `
    <div class="${entering ? 'screen-enter ' : ''}w-full ${cs.wrap} flex flex-col gap-6">
      <div class="flex items-center justify-between">
        ${backBtn(`${d.title} / ${S.lv!.label}`)}
        <div class="flex items-center gap-4">
          ${homeBtn()}
          <span class="text-sm text-stone-400 tabular-nums">${done} / ${S.total}</span>
        </div>
      </div>

      <div class="w-full h-0.5 bg-stone-200 rounded-full overflow-hidden">
        <div class="h-full bg-stone-800 rounded-full transition-all duration-300" style="width:${pct}%"></div>
      </div>

      <div class="relative bg-white border border-stone-200 rounded-2xl shadow-sm flex flex-col gap-6 py-14 px-16 min-h-[380px] justify-center">
        ${cardActions()}
        <div id="card-front" class="${cs.front} text-stone-900">
          ${S.side === 'back' && card.front.length === card.reading.length && card.reading
            ? annotatedFront(card.front, card.reading)
            : tokenizeHighlights(card.front)}
        </div>
        ${S.side === 'back' ? cardBack(card, cs, !(card.front.length === card.reading.length && card.reading)) : `
          <div class="text-sm text-stone-300 text-center">Space 키로 정답 보기</div>`}
      </div>

      <div class="flex flex-col items-center gap-3">
        ${S.side === 'back' ? ratingBtns : `
          <div class="text-sm text-stone-300">정답을 확인한 뒤 난이도를 선택하세요</div>`}
      </div>
    </div>`;
}

// ── Shortcut help modal ───────────────────────────────────
export function initShortcutHelp(): void {
  const el = document.createElement('div');
  el.id = 'shortcut-help';
  el.className = 'fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 hidden';
  el.innerHTML = `
    <div id="sh-panel" class="bg-white rounded-2xl shadow-xl px-8 py-7 w-full max-w-xs mx-4">
      <div class="text-sm font-bold text-stone-900 mb-5">키보드 단축키</div>
      <table class="w-full text-xs text-stone-600 border-separate" style="border-spacing:0 6px">
        <tbody>
          <tr><td class="text-stone-400 pr-4 whitespace-nowrap">홈</td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">1–N</td><td>문헌 선택</td></tr>
          <tr><td class="text-stone-400 pr-4">모드</td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">1 / 2</td><td>순차 / 안키</td></tr>
          <tr><td class="text-stone-400 pr-4">단위</td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">1–N</td><td>단위 선택</td></tr>
          <tr><td colspan="3" class="pt-2 pb-1 text-stone-300 text-xs">순차 모드</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">Space</td><td>뒤집기</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">← →</td><td>이전 / 다음</td></tr>
          <tr><td colspan="3" class="pt-2 pb-1 text-stone-300 text-xs">안키 모드</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">Space</td><td>뒤집기</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">1 / 2 / 3</td><td>어려움 / 보통 / 쉬움</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">R</td><td>다시 시작 (결과 화면)</td></tr>
          <tr><td colspan="3" class="pt-2 pb-1 text-stone-300 text-xs">전체</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">Esc</td><td>뒤로가기</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2">?</td><td>단축키 도움말</td></tr>
          <tr><td></td><td class="font-mono bg-stone-100 rounded px-1.5 py-0.5 mr-2 text-stone-400" style="font-size:10px">Ctrl⇧R</td><td>안키 기록 초기화</td></tr>
        </tbody>
      </table>
      <div class="mt-5 text-center text-xs text-stone-300">Esc 또는 ? 로 닫기</div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) hideShortcutHelp(); });
  el.querySelector('#sh-panel')?.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(el);

  const fab = document.createElement('button');
  fab.id = 'sh-fab';
  fab.className = 'fixed bottom-5 right-5 w-8 h-8 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-500 hover:text-stone-700 text-sm font-bold flex items-center justify-center transition-colors z-40';
  fab.textContent = '?';
  fab.addEventListener('click', () => { if (isShortcutHelpOpen()) hideShortcutHelp(); else showShortcutHelp(); });
  document.body.appendChild(fab);
}

export function isShortcutHelpOpen(): boolean {
  return !document.getElementById('shortcut-help')?.classList.contains('hidden');
}

export function showShortcutHelp(): void {
  document.getElementById('shortcut-help')?.classList.remove('hidden');
}

export function hideShortcutHelp(): void {
  document.getElementById('shortcut-help')?.classList.add('hidden');
}

// ── Onboarding ────────────────────────────────────────────
const OB_KEY = 'hanja-v2/onboarding-seen';

const OB_SLIDES: { title: string; html: string }[] = [
  {
    title: '학습 시작하기',
    html: `
      <div class="flex flex-col items-center gap-1.5 text-sm">
        ${['문헌 선택','모드 선택','단위 선택','학습'].map((s, i, a) =>
          `<span class="px-5 py-2 bg-stone-100 rounded-xl text-stone-700 w-32 text-center">${s}</span>${i < a.length-1 ? '<span class="text-stone-300 text-xs">↓</span>' : ''}`
        ).join('')}
      </div>
      <p class="text-sm text-stone-500 leading-relaxed mt-4 text-center">
        순차 모드는 카드를 차례로 넘기며 공부하고,<br>
        안키 모드는 모르는 카드를 집중 반복합니다.
      </p>`,
  },
  {
    title: '안키 모드',
    html: `
      <div class="flex justify-center gap-3">
        ${[
          ['Space','뒤집기','stone-100','text-stone-700',''],
          ['1','어려움','red-50','text-red-600','border border-red-100'],
          ['2','보통','amber-50','text-amber-700','border border-amber-100'],
          ['3','쉬움','green-50','text-green-700','border border-green-100'],
        ].map(([k,l,bg,tc,b]) =>
          `<div class="flex flex-col items-center gap-1.5">
            <kbd class="px-3 py-2 bg-${bg} ${tc} ${b} rounded-lg font-mono text-sm">${k}</kbd>
            <span class="text-xs text-stone-400">${l}</span>
          </div>`
        ).join('')}
      </div>
      <p class="text-sm text-stone-500 leading-relaxed mt-5 text-center">
        어려움·보통으로 평가한 카드는 다시 출제되고<br>쉬움은 오늘 학습 완료로 처리됩니다.
      </p>`,
  },
  {
    title: '드릴다운',
    html: `
      <div class="text-center hanja text-2xl text-stone-900 leading-loose">
        凡<span class="border-b-2 border-stone-400">大醫</span><span class="border-b-2 border-stone-400">治病</span>必先<span class="border-b-2 border-stone-400">定志</span>
      </div>
      <p class="text-sm text-stone-500 leading-relaxed mt-5 text-center">
        문장·단락 카드에서 <span class="border-b border-stone-500">밑줄 친 한자</span>를 클릭하면<br>
        해당 글자·단어 카드로 바로 이동합니다.<br>
        <span class="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">Esc</span> 로 원래 카드로 돌아옵니다.
      </p>`,
  },
  {
    title: '카드 추가·수정',
    html: `
      <div class="flex flex-col gap-3 text-sm">
        ${[
          ['추가','카드 앞면 텍스트를 드래그하면 "+ 카드 추가" 버블이 나타납니다'],
          ['수정·삭제','카드 우상단 아이콘 버튼으로 수정하거나 삭제할 수 있습니다'],
        ].map(([label, desc]) =>
          `<div class="flex items-start gap-3">
            <span class="text-xs font-bold text-stone-400 pt-0.5 w-14 shrink-0">${label}</span>
            <span class="text-stone-600 leading-relaxed">${desc}</span>
          </div>`
        ).join('')}
      </div>`,
  },
];

let _obIdx = 0;

function _obRender(): void {
  const slide = OB_SLIDES[_obIdx];
  const panel  = document.getElementById('ob-panel')!;
  panel.querySelector<HTMLElement>('#ob-title')!.textContent = slide.title;
  panel.querySelector<HTMLElement>('#ob-content')!.innerHTML = slide.html;
  panel.querySelector<HTMLElement>('#ob-dots')!.innerHTML = OB_SLIDES.map((_, i) =>
    `<div class="w-1.5 h-1.5 rounded-full transition-colors ${i === _obIdx ? 'bg-stone-800' : 'bg-stone-200'}"></div>`
  ).join('');
  const prev = panel.querySelector<HTMLButtonElement>('#ob-prev')!;
  const next = panel.querySelector<HTMLButtonElement>('#ob-next')!;
  prev.style.visibility = _obIdx === 0 ? 'hidden' : 'visible';
  if (_obIdx === OB_SLIDES.length - 1) {
    next.textContent = '시작하기';
  } else {
    next.textContent = '다음 →';
  }
}

export function isOnboardingOpen(): boolean {
  return !document.getElementById('ob-overlay')?.classList.contains('hidden');
}

export function showOnboarding(): void {
  _obIdx = 0;
  _obRender();
  document.getElementById('ob-overlay')!.classList.remove('hidden');
}

function hideOnboarding(): void {
  document.getElementById('ob-overlay')!.classList.add('hidden');
}

export function initOnboarding(): void {
  const overlay = document.createElement('div');
  overlay.id = 'ob-overlay';
  overlay.className = 'fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 hidden';
  overlay.innerHTML = `
    <div id="ob-panel" class="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
      <div class="px-8 pt-8 pb-6">
        <div id="ob-title" class="text-base font-bold text-stone-900 mb-5"></div>
        <div id="ob-content" class="min-h-[140px]"></div>
      </div>
      <div class="px-8 pb-8 flex flex-col gap-4">
        <div class="flex justify-center gap-1.5" id="ob-dots"></div>
        <div class="flex justify-between items-center">
          <button id="ob-prev" class="text-sm text-stone-400 hover:text-stone-700 transition-colors">← 이전</button>
          <button id="ob-next" class="px-5 py-2 text-sm font-medium bg-stone-900 text-white rounded-xl hover:bg-stone-700 transition-colors"></button>
        </div>
      </div>
    </div>`;

  const panel = overlay.querySelector<HTMLElement>('#ob-panel')!;
  panel.addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', () => {
    localStorage.setItem(OB_KEY, '1');
    hideOnboarding();
  });

  overlay.querySelector('#ob-prev')!.addEventListener('click', () => {
    if (_obIdx > 0) { _obIdx--; _obRender(); }
  });
  overlay.querySelector('#ob-next')!.addEventListener('click', () => {
    if (_obIdx < OB_SLIDES.length - 1) {
      _obIdx++;
      _obRender();
    } else {
      localStorage.setItem(OB_KEY, '1');
      hideOnboarding();
    }
  });

  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (overlay.classList.contains('hidden')) return;
    if (e.code === 'Space' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (_obIdx < OB_SLIDES.length - 1) { _obIdx++; _obRender(); }
      else { localStorage.setItem(OB_KEY, '1'); hideOnboarding(); }
    } else if (e.key === 'ArrowLeft') {
      if (_obIdx > 0) { _obIdx--; _obRender(); }
    } else if (e.key === 'Escape') {
      localStorage.setItem(OB_KEY, '1');
      hideOnboarding();
    }
  });

  // 가이드 FAB (? 버튼 위)
  const guide = document.createElement('button');
  guide.className = 'fixed bottom-14 right-5 w-8 h-8 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-500 hover:text-stone-700 flex items-center justify-center transition-colors z-40';
  guide.title = '사용법 보기';
  guide.innerHTML = `<svg width="15" height="15" viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="1" width="9" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
    <path d="M4 4.5H8M4 7H7M4 9.5H6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M10.5 4.5L12.5 6.5L10.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  guide.addEventListener('click', showOnboarding);
  document.body.appendChild(guide);

  // 첫 방문 자동 표시
  if (!localStorage.getItem(OB_KEY)) showOnboarding();
}

function renderResult(): void {
  const streak = recordStudySession(S.total);
  const failed = [...S.allCards]
    .filter(c => c.fail_count > 0)
    .sort((a, b) => b.fail_count - a.fail_count);
  const d = curDoc();

  const rows = failed.length > 0
    ? failed.map((c, i) => `
        <tr class="border-b border-stone-100">
          <td class="py-4 px-5 text-center text-stone-400 text-sm">${i + 1}</td>
          <td class="hanja py-4 px-5 text-center text-2xl text-stone-900">${esc(c.front)}</td>
          <td class="py-4 px-5 text-sm text-stone-500 leading-relaxed">${esc(c.reading)}${c.reading && c.back ? ' — ' : ''}${esc(c.back)}</td>
          <td class="py-4 px-5 text-center text-sm font-bold text-red-500">${c.fail_count}</td>
        </tr>`)
        .join('')
    : `<tr><td colspan="4" class="py-12 text-center text-stone-400 text-base">오답 없음 · 완벽합니다</td></tr>`;

  $app().innerHTML = `
    <div class="screen-enter w-full max-w-2xl flex flex-col gap-8">
      <div class="flex items-center justify-between">
        ${backBtn(`${d.title} / ${S.lv!.label}`)}
        ${homeBtn()}
      </div>
      <div class="text-center">
        <div class="text-3xl font-bold text-stone-900">학습 완료</div>
        <div class="text-sm text-stone-400 mt-2">${S.total}장 완료 · 오답 ${failed.length}장</div>
        <div class="flex justify-center gap-8 mt-5">
          <div class="text-center">
            <div class="text-2xl font-bold text-stone-800">${streak.count}일</div>
            <div class="text-xs text-stone-400 mt-1">연속 학습</div>
          </div>
          <div class="w-px bg-stone-100"></div>
          <div class="text-center">
            <div class="text-2xl font-bold text-stone-800">${streak.todayCards}장</div>
            <div class="text-xs text-stone-400 mt-1">오늘 학습</div>
          </div>
        </div>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-stone-100 bg-stone-50">
              <th class="py-4 px-5 text-center text-sm text-stone-400 font-medium">#</th>
              <th class="py-4 px-5 text-center text-sm text-stone-400 font-medium">한자</th>
              <th class="py-4 px-5 text-left text-sm text-stone-400 font-medium">해석</th>
              <th class="py-4 px-5 text-center text-sm text-stone-400 font-medium">오답</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="flex justify-center gap-8 text-sm text-stone-400">
        <span>R — 다시 시작</span>
        <span>Ctrl+Shift+R — 초기화</span>
      </div>
    </div>`;
}
