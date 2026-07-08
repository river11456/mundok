import { S, curDoc, DOCS, DRILL_LEVELS, getDocLastStudied } from './state';
import { DOC_GROUPS, homeDocs } from './docs';
import { hideBubble } from './addcard';
import { getAnnotations } from './grammar';
import { findDrillSpans, spansByStart, spansByIndex, type DrillCandidate } from './drill-match';
import { $app, esc, backBtn, homeBtn } from './render-shared';
import { renderResult } from './result-screen';
import type { Doc, GrammarAnnotation } from './types';

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

// ── Grammar annotation rendering ─────────────────────────

type SlotAnno = {
  svoType?: 'S' | 'V' | 'O';
  svoBg?: string;
  isFirstSvo?: boolean;
  phraseTop?: boolean;
  phraseLeft?: boolean;
  phraseRight?: boolean;
  phraseColor?: string;
};

function buildSlotMap(annotations: GrammarAnnotation[]): Map<number, SlotAnno> {
  const map    = new Map<number, SlotAnno>();
  const get    = (i: number) => { if (!map.has(i)) map.set(i, {}); return map.get(i)!; };
  const svoBg  : Record<string, string> = { S: 'bg-red-50', V: 'bg-blue-50', O: 'bg-green-50' };
  const phrases = ['border-indigo-400', 'border-purple-400', 'border-teal-400'];
  let phraseIdx = 0;

  for (const ann of annotations) {
    if (ann.type === 'S' || ann.type === 'V' || ann.type === 'O') {
      const midIdx = ann.start + Math.floor((ann.end - ann.start - 1) / 2);
      for (let i = ann.start; i < ann.end; i++) {
        const s = get(i);
        s.svoType = ann.type;
        s.svoBg   = svoBg[ann.type];
        if (i === midIdx) s.isFirstSvo = true;
      }
    } else if (ann.type === 'phrase') {
      const col = phrases[phraseIdx++ % phrases.length];
      for (let i = ann.start; i < ann.end; i++) {
        const s = get(i);
        s.phraseTop   = true;
        s.phraseColor = col;
        if (i === ann.start)     s.phraseLeft  = true;
        if (i === ann.end - 1)   s.phraseRight = true;
      }
    }
  }
  return map;
}

/** 하위 레벨(char/word/sentence) 카드 중 text에 등장하는 것들을 드릴다운 매칭 후보로 모은다. */
function drillCandidates(text: string): DrillCandidate[] {
  const nextKeys = S.lv ? DRILL_LEVELS[S.lv.key] : null;
  if (!nextKeys) return [];
  const doc = curDoc();
  return nextKeys.flatMap(key => (doc.levels.find(l => l.key === key)?.cards ?? []).filter(c => text.includes(c.front)));
}

function renderGrammarSentence(
  front: string,
  reading: string,
  annotations: GrammarAnnotation[],
  isFlipped: boolean,
  editMode: boolean,
): string {
  // 어노테이션도 없고 표시 모드면 → 일반 렌더링과 완전히 동일
  if (!editMode && annotations.length === 0) {
    return isFlipped && front.length === reading.length && reading
      ? annotatedFront(front, reading)
      : tokenizeHighlights(front);
  }

  const chars       = [...front];
  const perCharRead = isFlipped && reading.length === chars.length && reading;
  const slotMap     = buildSlotMap(annotations);
  const hasAnyLabel = annotations.some(a => a.type !== 'phrase');
  const svoTailwind: Record<string, string> = {
    S: 'text-red-500', V: 'text-blue-500', O: 'text-green-600',
  };

  // ── 편집 모드: flex 그리드, 글자별 드래그 가능 셀 ─────────
  if (editMode) {
    const cells = chars.map((ch, i) => {
      const s  = slotMap.get(i) ?? {};
      const bg = s.svoBg ?? '';
      let phraseCls = '';
      if (s.phraseTop) {
        phraseCls = `border-t-2 ${s.phraseColor}`;
        if (s.phraseLeft)  phraseCls += ' border-l-2 rounded-tl-sm';
        if (s.phraseRight) phraseCls += ' border-r-2 rounded-tr-sm';
      }
      const badge = s.svoType && s.isFirstSvo
        ? `<span class="text-[10px] font-bold leading-none select-none ${svoTailwind[s.svoType]}">${s.svoType}</span>`
        : hasAnyLabel
          ? `<span class="text-[10px] leading-none select-none invisible">_</span>`
          : '';
      const rdChar = perCharRead
        ? `<span class="text-[11px] text-stone-400 leading-none mt-0.5 select-none">${esc(reading[i])}</span>`
        : '';
      return `<span class="ci inline-flex flex-col items-center leading-none pt-0.5 select-none ${bg} ${phraseCls} cursor-pointer hover:bg-stone-100" data-char-idx="${i}">
        ${badge}
        <span class="hanja text-2xl leading-none pointer-events-none">${esc(ch)}</span>
        ${rdChar}
      </span>`;
    }).join('');
    return `<div class="grammar-edit-grid flex flex-wrap" style="gap:6px 2px">${cells}</div>`;
  }

  // ── 표시 모드 ──────────────────────────────────────────────
  const drillMap = spansByIndex(findDrillSpans(front, drillCandidates(front)));

  const READ_RT = `font-size:12px;font-family:'Noto Sans KR',sans-serif;color:#a8a29e`;
  const SVO_BG: Record<string, string> = {
    S: '#fef2f2', V: '#eff6ff', O: '#f0fdf4',
  };
  const SVO_COLOR: Record<string, string> = {
    S: '#ef4444', V: '#3b82f6', O: '#16a34a',
  };
  const PHRASE_CLS: Record<string, string> = {
    'border-indigo-400': 'border-t-2 border-indigo-400',
    'border-purple-400': 'border-t-2 border-purple-400',
    'border-teal-400':   'border-t-2 border-teal-400',
  };

  // SVO 어노테이션별 고유 키 맵 (char index → {key, ann})
  type SvoEntry = { key: string; ann: GrammarAnnotation };
  const svoSpanMap = new Map<number, SvoEntry>();
  for (const ann of annotations.filter(a => a.type !== 'phrase')) {
    const key = `${ann.start}-${ann.end}-${ann.type}`;
    for (let k = ann.start; k < ann.end; k++) svoSpanMap.set(k, { key, ann });
  }

  // 글자별 읽기(독음) — SVO 배경/레이블은 wrapper span에서 처리
  const charContent = (i: number): string => {
    const ch = esc(chars[i]);
    return perCharRead
      ? `<ruby>${ch}<rt style="${READ_RT}">${esc((reading as string)[i])}</rt></ruby>`
      : ch;
  };

  // 글자별 구절 클래스 매핑
  const charPhraseCls = new Map<number, string>();
  for (const ann of annotations.filter(a => a.type === 'phrase')) {
    const col = slotMap.get(ann.start)?.phraseColor ?? 'border-indigo-400';
    const cls = PHRASE_CLS[col] ?? PHRASE_CLS['border-indigo-400'];
    for (let k = ann.start; k < ann.end; k++) charPhraseCls.set(k, cls);
  }

  // 상태 기계: phrase > SVO > drill 순으로 중첩
  let html = '';
  let curPhraseCls: string | null = null;
  let curSvoKey:    string | null = null;
  let curDrillId:   string | null = null;

  const closeDrill  = () => { if (curDrillId   !== null) { html += '</span>'; curDrillId   = null; } };
  const closeSvo    = () => { if (curSvoKey    !== null) { html += '</span>'; curSvoKey    = null; } };
  const closePhrase = () => { if (curPhraseCls !== null) { html += '</span>'; curPhraseCls = null; } };

  let i = 0;
  while (i < chars.length) {
    const phraseCls = charPhraseCls.get(i) ?? null;
    const svoEntry  = svoSpanMap.get(i) ?? null;
    const svoKey    = svoEntry?.key ?? null;
    const drill     = drillMap.get(i) ?? null;
    const drillId   = drill?.id ?? null;

    if (phraseCls !== curPhraseCls) {
      closeDrill(); closeSvo(); closePhrase();
      curPhraseCls = phraseCls;
      if (phraseCls) html += `<span class="${phraseCls}">`;
    }
    if (svoKey !== curSvoKey) {
      closeDrill(); closeSvo();
      curSvoKey = svoKey;
      if (svoEntry) {
        const { ann } = svoEntry;
        const lbl = `<span style="position:absolute;bottom:100%;left:0;right:0;text-align:center;font-size:10px;font-weight:700;color:${SVO_COLOR[ann.type]};line-height:1;padding-bottom:2px;pointer-events:none">${ann.type}</span>`;
        html += `<span style="position:relative;display:inline-block;vertical-align:baseline;background:${SVO_BG[ann.type]}">${lbl}`;
      }
    }
    if (drillId !== curDrillId) {
      closeDrill();
      curDrillId = drillId;
      if (drill) {
        html += `<span data-action="drill-down" data-arg="${esc(drill.id)}" title="${esc(drill.back)}"
          class="border-b-2 border-stone-300 cursor-pointer hover:bg-amber-50 hover:border-amber-500 transition-colors">`;
      }
    }

    html += charContent(i++);
  }
  closeDrill(); closeSvo(); closePhrase();

  return html;
}

function grammarButtons(): string {
  const viewCls = S.grammarOn
    ? 'bg-indigo-500 text-white'
    : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50';
  const editCls = S.grammarEditMode
    ? 'bg-amber-500 text-white'
    : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50';
  return `
    <span class="inline-flex items-center rounded-lg border border-stone-200 overflow-hidden text-[11px] font-medium">
      <span class="px-2.5 py-1 text-stone-400 bg-stone-50 border-r border-stone-200 hanja select-none">文法</span>
      <button data-action="toggle-grammar" title="문법 표시"
        class="px-2.5 py-1 transition-colors ${viewCls}">보기</button>
      <span class="w-px bg-stone-200 self-stretch"></span>
      <button data-action="toggle-grammar-edit" title="문법 편집"
        class="px-2.5 py-1 transition-colors ${editCls}">편집</button>
    </span>`;
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
  const spans = findDrillSpans(text, drillCandidates(text));
  if (spans.length === 0) return esc(text);

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

function annotatedFront(front: string, reading: string): string {
  const spans   = S.lv ? findDrillSpans(front, drillCandidates(front)) : [];
  const byStart = spansByStart(spans);

  const charSpan = (ch: string, rd: string) =>
    `<ruby>${esc(ch)}<rt style="font-size:12px;font-family:'Noto Sans KR',sans-serif;color:#a8a29e">${esc(rd)}</rt></ruby>`;

  let html = '';
  let i = 0;
  while (i < front.length) {
    const sp = byStart.get(i);
    if (sp) {
      const inner = [...front.slice(sp.start, sp.end)].map((ch, j) => charSpan(ch, reading[sp.start + j])).join('');
      html += `<span data-action="drill-down" data-arg="${esc(sp.id)}" title="${esc(sp.back)}" class="inline-block border-b-2 border-stone-300 cursor-pointer hover:bg-amber-50 hover:border-amber-500 transition-colors">${inner}</span>`;
      i = sp.end;
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

function cardActions(lvKey?: string): string {
  return `
  <div class="absolute top-4 right-4 flex gap-1 items-center">
    ${lvKey === 'sentence' ? grammarButtons() : ''}
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
  const groupMap = new Map(DOC_GROUPS.map(g => [g.parentId, g.childIds]));

  const mainBtn = (d: Doc): string => {
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
  };

  const refBtn = (d: Doc): string => {
    const totalCards = d.levels.reduce((s, l) => s + l.cards.length, 0);
    return `
    <button data-action="nav-mode" data-arg="${d.id}"
      class="w-full text-left px-4 py-3 bg-stone-50 border border-stone-100 rounded-xl hover:border-stone-300 hover:bg-white hover:shadow-sm transition-all">
      <div class="flex items-center gap-2">
        <div class="hanja text-base text-stone-700">${esc(d.title)}</div>
        <div class="text-xs text-stone-400 truncate flex-1">${esc(d.sub)}</div>
        <div class="text-xs text-stone-300 shrink-0">${totalCards}장</div>
      </div>
    </button>`;
  };

  const items = homeDocs()
    .map(d => {
      const childIds = groupMap.get(d.id);
      if (!childIds) return mainBtn(d);
      const childDocs = childIds
        .map(id => DOCS.find(doc => doc.id === id))
        .filter((doc): doc is Doc => doc !== undefined);
      const expanded = S.expandedRefGroups.has(d.id);
      return `
      <div class="flex flex-col gap-1.5">
        ${mainBtn(d)}
        <div class="ml-3 pl-3 border-l-2 border-stone-100 flex flex-col gap-1">
          <button data-action="toggle-refs" data-arg="${d.id}"
            class="flex items-center gap-1.5 px-1 pt-0.5 w-fit text-xs text-stone-300 hover:text-stone-500 transition-colors">
            <span style="display:inline-block;transition:transform 0.2s;transform:rotate(${expanded ? 90 : 0}deg)">▶</span>
            참고문헌 ${childDocs.length}
          </button>
          <div id="ref-group-${d.id}" class="${expanded ? '' : 'hidden'} flex flex-col gap-1">
            ${childDocs.map(refBtn).join('')}
          </div>
        </div>
      </div>`;
    })
    .join('');

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

  const isSentGrammar = S.lv?.key === 'sentence' && S.grammarOn;
  const sentAnnotations = isSentGrammar ? getAnnotations(S.docId!, card.front) : [];
  const frontHtml = isSentGrammar
    ? renderGrammarSentence(card.front, card.reading, sentAnnotations, S.seqFlipped, S.grammarEditMode)
    : (S.seqFlipped && card.front.length === card.reading.length && card.reading
        ? annotatedFront(card.front, card.reading)
        : tokenizeHighlights(card.front));

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
        ${cardActions(S.lv?.key)}
        <div id="card-front" class="${cs.front} text-stone-900">
          ${frontHtml}
        </div>
        ${S.seqFlipped ? cardBack(card, cs, !(card.front.length === card.reading.length && card.reading)) : `
          <div class="text-sm text-stone-300 text-center">Space 키로 정답 보기</div>`}
        ${S.grammarEditMode ? `<div class="text-xs text-center text-amber-600 pt-3 border-t border-stone-100 mt-2">문법 편집 모드 — 한자를 드래그해서 표시 영역을 선택하세요</div>` : ''}
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

  const isSentGrammar   = S.lv?.key === 'sentence' && S.grammarOn;
  const sentAnnotations = isSentGrammar ? getAnnotations(S.docId!, card.front) : [];
  const isFlipped       = S.side === 'back';
  const frontHtml = isSentGrammar
    ? renderGrammarSentence(card.front, card.reading, sentAnnotations, isFlipped, S.grammarEditMode)
    : (isFlipped && card.front.length === card.reading.length && card.reading
        ? annotatedFront(card.front, card.reading)
        : tokenizeHighlights(card.front));

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
        ${cardActions(S.lv?.key)}
        <div id="card-front" class="${cs.front} text-stone-900">
          ${frontHtml}
        </div>
        ${isFlipped ? cardBack(card, cs, !(card.front.length === card.reading.length && card.reading)) : `
          <div class="text-sm text-stone-300 text-center">Space 키로 정답 보기</div>`}
        ${S.grammarEditMode ? `<div class="text-xs text-center text-amber-600 pt-3 border-t border-stone-100 mt-2">문법 편집 모드 — 한자를 드래그해서 표시 영역을 선택하세요</div>` : ''}
      </div>

      <div class="flex flex-col items-center gap-3">
        ${S.side === 'back' ? ratingBtns : `
          <div class="text-sm text-stone-300">정답을 확인한 뒤 난이도를 선택하세요</div>`}
      </div>
    </div>`;
}

