import { S, curDoc, DOCS, DRILL_LEVELS, getDocLastStudied, getStreak, getLastSession, collapsedShelves } from './state';
import { homeDocs, shelvesForHome, refsOf, docColor } from './docs';
import { isServerMode } from './storage';
import { resetCellSelect } from './cell-select';
import { getAnnotations } from './grammar';
import { findDrillSpans, spansByIndex, type DrillCandidate } from './drill-match';
import { alignReading } from './reading-align';
import { $app, esc, backBtn, homeBtn } from './render-shared';
import { renderResult } from './result-screen';
import type { Doc, GrammarAnnotation } from './types';
import { version } from '../package.json';

type CardStyle = { wrap: string; front: string; backAlign: string };

function cardStyle(key: string): CardStyle {
  switch (key) {
    case 'char':
      return { wrap: 'max-w-2xl',  front: 'hanja kai bigchar text-center', backAlign: 'text-center' };
    case 'word':
      return { wrap: 'max-w-2xl',  front: 'hanja text-5xl tracking-wide text-center',   backAlign: 'text-center' };
    case 'sentence':
      return { wrap: 'max-w-4xl', front: 'hanja sentence-body text-left',  backAlign: 'text-left' };
    case 'paragraph':
      return { wrap: 'max-w-5xl', front: 'hanja paragraph-body text-left',   backAlign: 'text-left' };
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
  const svoBg  : Record<string, string> = { S: 'svo-bg-S', V: 'svo-bg-V', O: 'svo-bg-O' };
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

type FrontOpts = {
  /** alignReading 결과 — null이면 글자별 음 불가(정렬 실패·char·독음 없음) */
  reads:       (string | null)[] | null;
  showReading: boolean;
  annotations: GrammarAnnotation[];
  editMode:    boolean;
};

/** 셀 하나의 문법(SVO 배경·구절 테두리) 클래스 — 표시·편집 그리드가 공유 */
function slotClasses(s: SlotAnno | undefined): string {
  let cls = '';
  if (s?.svoBg) cls += ` ${s.svoBg}`;
  if (s?.phraseTop) {
    cls += ` border-t-2 ${s.phraseColor}`;
    if (s.phraseLeft)  cls += ' border-l-2 rounded-tl-sm';
    if (s.phraseRight) cls += ' border-r-2 rounded-tr-sm';
  }
  return cls;
}

/**
 * 학습 카드 본문 렌더러 — 글자 셀 단위 (design/char-cell.md).
 * 앞·뒷면이 같은 셀 구조를 공유하고 음(.cc-rd)·문법 레이블(.cc-svo)은 absolute
 * → 음 토글·드릴 밑줄·문법 표시가 서로/한자 배치에 간섭하지 않는다 (R1~R3·R8).
 */
function renderFront(front: string, opts: FrontOpts): string {
  const chars   = [...front];
  const reads   = opts.showReading ? opts.reads : null;
  const slotMap = opts.annotations.length ? buildSlotMap(opts.annotations) : null;
  const svoFg: Record<string, string> = { S: 'svo-fg-S', V: 'svo-fg-V', O: 'svo-fg-O' };

  // ── 문법 편집: flex 그리드, 글자별 드래그 가능 셀 (grammar-edit.ts의 data-char-idx) ──
  if (opts.editMode) {
    const hasAnyLabel = opts.annotations.some(a => a.type !== 'phrase');
    const cells = chars.map((ch, i) => {
      const s = slotMap?.get(i);
      const badge = s?.svoType && s.isFirstSvo
        ? `<span class="text-[10px] font-bold leading-none select-none ${svoFg[s.svoType]}">${s.svoType}</span>`
        : hasAnyLabel
          ? `<span class="text-[10px] leading-none select-none invisible">_</span>`
          : '';
      const rd = reads
        ? `<span class="cc-rd-e ${reads[i] ? '' : 'invisible'}">${esc(reads[i] ?? '·')}</span>`
        : '';
      return `<span class="ci inline-flex flex-col items-center leading-none pt-0.5 select-none${slotClasses(s)} cursor-pointer hover:bg-[rgba(0,0,0,.05)]" data-char-idx="${i}">
        ${badge}
        <span class="hanja text-2xl leading-none pointer-events-none">${esc(ch)}</span>
        ${rd}
      </span>`;
    }).join('');
    return `<div class="grammar-edit-grid flex flex-wrap" style="gap:6px 2px">${cells}</div>`;
  }

  // ── 표시: 드릴 스팬(inline) 안팎 모두 같은 글자 셀 ──
  const drillMap = spansByIndex(findDrillSpans(front, drillCandidates(front)));

  let html = '';
  let curDrill: string | null = null;
  for (let i = 0; i < chars.length; i++) {
    const sp = drillMap.get(i) ?? null;
    if ((sp?.id ?? null) !== curDrill) {
      if (curDrill !== null) html += '</span>';
      curDrill = sp?.id ?? null;
      if (sp) html += `<span data-action="drill-down" data-arg="${esc(sp.id)}" title="${esc(sp.back)}" class="drill">`;
    }
    const s = slotMap?.get(i);
    const label = s?.svoType && s.isFirstSvo
      ? `<span class="cc-svo ${svoFg[s.svoType]}">${s.svoType}</span>`
      : '';
    const rd = reads?.[i] ? `<span class="cc-rd">${esc(reads[i]!)}</span>` : '';
    html += `<span class="cc${slotClasses(s)}" data-i="${i}">${esc(chars[i])}${label}${rd}</span>`;
  }
  if (curDrill !== null) html += '</span>';
  return html;
}

/** 文 아이콘 + 확장 메뉴 (카드 도구, 문장 카드) — 표시·편집 두 항목. 표시 단축키 G. */
function grammarMenuBtn(): string {
  const active = S.grammarOn || S.grammarEditMode;
  return `
  <div class="gram-wrap relative">
    <button data-action="toggle-grammar-menu" class="icon-btn${active ? ' on' : ''}" title="문법 (G: 표시 토글)"
      aria-label="문법 메뉴" aria-haspopup="true" aria-expanded="${S.grammarMenu}">
      <span class="hanja select-none" style="font-size:15px;line-height:1">文</span>
    </button>
    ${S.grammarMenu ? `
    <div class="gram-menu">
      <button data-action="toggle-grammar" class="gram-item${S.grammarOn ? ' on' : ''}">
        <span>문법 표시</span><span class="gram-key select-none kb-only">G</span>
      </button>
      <button data-action="toggle-grammar-edit" class="gram-item${S.grammarEditMode ? ' on' : ''}">
        <span>문법 편집</span>
      </button>
    </div>` : ''}
  </div>`;
}

let _prevScr = '';

export function render(): void {
  resetCellSelect();
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



function cardBack(card: { reading: string; back: string; note: string }, cs: CardStyle, showReading = true): string {
  return `
    <div class="card-back flex flex-col gap-3">
      ${showReading && card.reading ? `<div class="reading-line ${cs.backAlign}">${esc(card.reading)}</div>` : ''}
      ${card.back    ? `<div class="meaning ${cs.backAlign}">${esc(card.back)}</div>` : ''}
      ${card.note    ? `<div class="text-sm t-sub ${cs.backAlign} leading-relaxed border-t border-[rgba(0,0,0,.05)] pt-3">${esc(card.note)}</div>` : ''}
    </div>`;
}

/** 카드 하단(정답/힌트) — char 카드는 높이를 예약해 뒤집어도 대형 한자가 부동 (R6) */
function belowFront(inner: string, isChar: boolean): string {
  return isChar ? `<div class="char-hold">${inner}</div>` : inner;
}

/** 앞면 하단 "정답 보기" — 탭·클릭 실 버튼(터치 필수 경로), Space 병기는 키보드 기기만 */
function revealHint(): string {
  return `
    <div class="flex items-center justify-center gap-3">
      <button data-action="flip" class="btn-ghost">정답 보기</button>
      <span class="kb-only text-sm t-faint"><kbd class="kbd">Space</kbd></span>
    </div>`;
}

function cardActions(lvKey?: string): string {
  return `
  <div class="absolute top-4 right-4 flex gap-1 items-center">
    <button data-action="edit-card" class="icon-btn" title="카드 수정" aria-label="카드 수정">
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
        <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    ${lvKey === 'sentence' ? grammarMenuBtn() : ''}
    <button data-action="delete-card" class="icon-btn icon-btn-danger" title="카드 삭제" aria-label="카드 삭제">
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 4H11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M5 4V3C5 2.4 5.4 2 6 2H8C8.6 2 9 2.4 9 3V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M4 4L4.5 11.5H9.5L10 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>`;
}

// ── 서가 홈 (Phase 2 4단계 — 목업 final.html 화면 1) ─────────

function docTotalCards(d: Doc): number {
  return d.levels.reduce((s, l) => s + l.cards.length, 0);
}

function heroWhen(ts: number): string {
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const d = new Date(ts);
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (key(d) === key(new Date())) return '오늘';
  if (key(d) === key(yest))       return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 이어서 학습 히어로 — 기록이 없거나 문헌·레벨이 사라졌으면 빈 문자열. */
function heroHtml(): string {
  const last = getLastSession();
  if (!last) return '';
  const doc = DOCS.find(d => d.id === last.docId);
  const lv  = doc?.levels.find(l => l.key === last.lvKey);
  if (!doc || !lv) return '';
  const modeLabel = last.mode === 'seq' ? '순차' : '안키';
  const cur = last.mode === 'seq' ? Math.min(last.idx, lv.cards.length - 1) + 1 : last.idx;
  return `
    <div class="hero">
      <div class="hero-cover" style="--cbg:${docColor(doc)}"><span class="slip kai">${esc(doc.title)}</span></div>
      <div class="hero-main">
        <div class="hero-eyebrow">이어서 학습</div>
        <div class="hero-title"><span class="kai hanja">${esc(doc.title)}</span> <span class="lv">· ${esc(lv.label)} · ${modeLabel}</span></div>
        <div class="hero-sub">${heroWhen(last.ts)} 학습 · <span class="num">${cur} / ${last.total}</span> 진행</div>
      </div>
      <button data-action="resume" class="hero-btn">이어하기</button>
    </div>`;
}

function coverHtml(d: Doc, key: number | undefined): string {
  const refs   = refsOf(d.id);
  const recent = getDocLastStudied(d.id);
  const coverBtn = `
    <button data-action="open-doc" data-arg="${d.id}" class="cover" style="--cbg:${docColor(d)}">
      <span class="slip kai hanja">${esc(d.title)}</span>
      ${key !== undefined && key <= 9 ? `<span class="key num kb-only">${key}</span>` : ''}
      <span class="cmeta num">${docTotalCards(d)}장</span>
      ${recent ? `<span class="recent">${esc(recent)}</span>` : ''}
    </button>`;
  const wrapped = refs.length
    ? `<div class="case-wrap">
         <span class="stack">${refs.slice(0, 3).map(r => `<i style="background:${docColor(r)}"></i>`).join('')}</span>
         ${coverBtn}
       </div>`
    : coverBtn;
  return `
    <div class="book">
      ${wrapped}
      <div class="book-label"><div class="k">${esc(d.sub)}</div></div>
    </div>`;
}

/** 문헌 상세 오버레이 — 참고문헌 보유 문헌의 표지 클릭 시. 목록창 기능 겸용. */
function docOverlayHtml(docId: string): string {
  const d = DOCS.find(x => x.id === docId);
  if (!d) return '';
  const refs   = refsOf(docId);
  const recent = getDocLastStudied(docId);
  return `
  <div class="doc-overlay" data-action="overlay-backdrop">
    <div class="detail" role="dialog" aria-modal="true" aria-label="${esc(d.title)} 상세">
      <button data-action="close-overlay" class="close" title="닫기" aria-label="닫기">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <div class="detail-head">
        <div class="detail-cover" style="--cbg:${docColor(d)}"><span class="slip kai hanja">${esc(d.title)}</span></div>
        <div>
          <div class="detail-title kai hanja">${esc(d.title)}</div>
          <div class="detail-sub">${esc(d.sub)} · <span class="num">${docTotalCards(d)}장</span>${recent ? ` · 최근 학습 ${esc(recent)}` : ''}</div>
          <div class="detail-actions">
            <button data-action="overlay-mode" data-arg="anki" class="btn-primary">안키 모드</button>
            <button data-action="overlay-mode" data-arg="seq" class="btn-ghost">순차 재생</button>
          </div>
        </div>
      </div>
      <div class="lv-chips">
        ${d.levels.map(lv => `<span class="lv-chip"><b class="num">${lv.cards.length}</b>${esc(lv.label)}</span>`).join('')}
      </div>
      ${d.userDoc ? `
      <div class="detail-user-actions">
        <button data-action="doc-append" class="btn-ghost">본문 추가</button>
        <button data-action="doc-edit-info" class="btn-ghost">정보 수정</button>
        <button data-action="doc-delete" class="btn-ghost danger">문헌 삭제</button>
      </div>` : ''}
      ${refs.length ? `
      <div class="detail-refs">
        <h3>참고문헌 ${refs.length}</h3>
        <div class="dref-grid">
          ${refs.map((r, i) => `
          <div class="dref">
            <button data-action="overlay-ref" data-arg="${r.id}" class="dref-cover" style="--cbg:${docColor(r)}">
              <span class="slip kai hanja">${esc(r.title)}</span><span class="key num kb-only">${i + 1}</span>
              <span class="cmeta num">${docTotalCards(r)}장</span>
            </button>
            <div class="k">${esc(r.sub)}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
      <div class="detail-foot kb-only">Esc 또는 바깥을 클릭하면 닫힙니다</div>
    </div>
  </div>`;
}

function renderHome(): void {
  const keyOf = new Map(homeDocs().map((d, i) => [d.id, i + 1]));
  const collapsed = collapsedShelves();
  const streak = getStreak();
  const shelfData = shelvesForHome();

  const addTile = `
    <div class="book">
      <button data-action="new-doc" class="cover add" aria-label="새 문헌 만들기">
        <span class="add-plus">+</span><span class="add-label">새 문헌</span>
      </button>
      <div class="book-label"><div class="k">&nbsp;</div></div>
    </div>${isServerMode() ? '' : `
    <div class="book">
      <button data-action="open-catalog" class="cover add" aria-label="문헌 받기">
        <span class="add-plus">⤓</span><span class="add-label">문헌 받기</span>
      </button>
      <div class="book-label"><div class="k">&nbsp;</div></div>
    </div>`}`;

  const shelves = shelfData.map((sh, i) => {
    const isCollapsed = collapsed.has(sh.id);
    return `
    <div>
      <div class="shelf-head">
        <button data-action="toggle-shelf" data-arg="${sh.id}" class="shelf-toggle" title="${isCollapsed ? '펼치기' : '접기'}"
          aria-label="${esc(sh.name)} ${isCollapsed ? '펼치기' : '접기'}" aria-expanded="${!isCollapsed}">
          <svg class="chev" style="transform:rotate(${isCollapsed ? 0 : 90}deg)" width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <h2>${esc(sh.name)}</h2><span class="cnt num">${sh.docs.length}</span>
        ${i === 0 && isServerMode() ? `<button data-action="edit-groups" class="edit">그룹 편집</button>` : ''}
      </div>
      ${isCollapsed ? '' : `<div class="covers">${sh.docs.map(d => coverHtml(d, keyOf.get(d.id))).join('')}${sh.id === '_user' ? addTile : ''}</div>`}
    </div>`;
  }).join('');

  // '내 문헌' 선반이 없으면(사용자 문헌 0개) 새 문헌 타일만 담은 섹션을 맨 아래에
  const newDocSection = shelfData.some(sh => sh.id === '_user') ? '' : `
    <div>
      <div class="shelf-head"><h2>${isServerMode() ? '새 문헌' : '내 문헌'}</h2></div>
      <div class="covers">${addTile}</div>
    </div>`;

  $app().innerHTML = `
    <div class="screen-enter home">
      <div class="home-head">
        <div>
          <div class="wordmark kai hanja">文讀</div>
          <div class="tagline">편하고 효율적인 한의학 한문 학습</div>
        </div>
        ${streak.count > 0 ? `<div class="streak-pill">연속 학습 <b class="num">${streak.count}</b>일</div>` : ''}
      </div>
      ${heroHtml()}
      ${shelves}
      ${newDocSection}
      <div class="home-foot">
        해석 작성에 생성형 AI가 참여해 일부 내용이 부정확할 수 있습니다. 원문과 수업 자료로 직접 확인하며 학습해 주세요.
        <div class="ver">v${version} · KJH</div>
      </div>
    </div>
    ${S.docOverlay ? docOverlayHtml(S.docOverlay) : ''}`;
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
        <div class="hanja text-2xl t-ink">${esc(d.title)}</div>
        <div class="text-sm t-sub mt-1">${esc(d.sub)}</div>
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <button data-action="nav-level" data-arg="seq" class="tile p-8">
          <div class="text-3xl t-faint mb-4">→</div>
          <div class="text-base font-bold t-ink">순차 재생</div>
          <div class="text-sm t-sub mt-1.5 leading-relaxed">전체를 순서대로</div>
          <div class="mt-4 flex gap-1.5 kb-only"><kbd class="kbd">Space</kbd><kbd class="kbd">←</kbd><kbd class="kbd">→</kbd></div>
        </button>
        <button data-action="nav-level" data-arg="anki" class="tile p-8">
          <div class="text-3xl t-faint mb-4">↺</div>
          <div class="text-base font-bold t-ink">안키 모드</div>
          <div class="text-sm t-sub mt-1.5 leading-relaxed">모르는 것 집중 반복</div>
          <div class="mt-4 flex gap-1.5 kb-only"><kbd class="kbd">Space</kbd><kbd class="kbd">1</kbd><kbd class="kbd">2</kbd><kbd class="kbd">3</kbd></div>
        </button>
      </div>
    </div>`;
}

function renderLevel(): void {
  const d = curDoc();
  const modeLabel = S.mode === 'seq' ? '순차 재생' : '안키 모드';
  const rows = d.levels.map((lv, i) => `
    <button data-action="start-study" data-arg="${i}" class="tile w-full px-7 py-5">
      <div class="flex items-center justify-between">
        <div class="text-base font-bold t-ink">${esc(lv.label)}</div>
        <div class="flex items-center gap-4">
          <span class="text-sm t-sub num">${lv.cards.length}장</span>
          <svg class="chev w-5 h-5 t-faint transition-colors" viewBox="0 0 16 16" fill="none">
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
        <div class="text-sm t-sub"><span class="hanja">${esc(d.title)}</span> · ${modeLabel}</div>
        <div class="text-xl font-bold t-ink mt-1">단위 선택</div>
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
  const isChar = S.lv!.key === 'char';
  const reads  = isChar ? null : alignReading(card.front, card.reading);
  const rdOn   = S.seqFlipped && reads !== null;
  const frontHtml = isChar ? esc(card.front) : renderFront(card.front, {
    reads,
    showReading:  S.seqFlipped,
    annotations:  sentAnnotations,
    editMode:     isSentGrammar && S.grammarEditMode,
  });

  $app().innerHTML = `
    <div class="${entering ? 'screen-enter ' : ''}w-full ${cs.wrap} flex flex-col gap-6">
      <div class="flex items-center justify-between">
        ${backBtn(backLabel)}
        <div class="flex items-center gap-4">
          ${homeBtn()}
          <span class="text-[13px] t-sub num">${S.seqIdx + 1} / ${cards.length}</span>
        </div>
      </div>

      <div class="progress-track w-full" role="progressbar" aria-label="진행률"
        aria-valuemin="0" aria-valuemax="${cards.length}" aria-valuenow="${S.seqIdx + 1}">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>

      <div class="card-surface">
        ${cardActions(S.lv?.key)}
        <div id="card-front" class="${cs.front}${rdOn ? ' rd-on' : ''} t-ink">
          ${frontHtml}
        </div>
        ${belowFront(S.seqFlipped ? cardBack(card, cs, reads === null) : revealHint(), isChar)}
        ${S.grammarEditMode ? `<div class="text-xs text-center text-[var(--warn)] pt-3 border-t border-[var(--line-soft)] mt-2">문법 편집 모드 — 한자를 드래그해서 표시 영역을 선택하세요</div>` : ''}
      </div>

      <div class="flex justify-between items-center">
        <button data-action="seq-prev" class="nav-btn" ${S.seqIdx === 0 ? 'disabled' : ''}>
          ← 이전
        </button>
        <kbd class="kbd kb-only">Space</kbd>
        <button data-action="seq-next" class="nav-btn" ${S.seqIdx === cards.length - 1 ? 'disabled' : ''}>
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
      <button data-action="anki-rate" data-arg="1" class="rate-btn rate-hard"><span class="kb-only">1&nbsp;&nbsp;</span>어려움</button>
      <button data-action="anki-rate" data-arg="2" class="rate-btn rate-mid"><span class="kb-only">2&nbsp;&nbsp;</span>보통</button>
      <button data-action="anki-rate" data-arg="3" class="rate-btn rate-easy"><span class="kb-only">3&nbsp;&nbsp;</span>쉬움</button>
    </div>`;

  const cs = cardStyle(S.lv!.key);

  const isSentGrammar   = S.lv?.key === 'sentence' && S.grammarOn;
  const sentAnnotations = isSentGrammar ? getAnnotations(S.docId!, card.front) : [];
  const isFlipped       = S.side === 'back';
  const isChar = S.lv!.key === 'char';
  const reads  = isChar ? null : alignReading(card.front, card.reading);
  const rdOn   = isFlipped && reads !== null;
  const frontHtml = isChar ? esc(card.front) : renderFront(card.front, {
    reads,
    showReading:  isFlipped,
    annotations:  sentAnnotations,
    editMode:     isSentGrammar && S.grammarEditMode,
  });

  $app().innerHTML = `
    <div class="${entering ? 'screen-enter ' : ''}w-full ${cs.wrap} flex flex-col gap-6">
      <div class="flex items-center justify-between">
        ${backBtn(`${d.title} / ${S.lv!.label}`)}
        <div class="flex items-center gap-4">
          ${homeBtn()}
          <span class="text-[13px] t-sub num">${done} / ${S.total}</span>
        </div>
      </div>

      <div class="progress-track w-full" role="progressbar" aria-label="진행률"
        aria-valuemin="0" aria-valuemax="${S.total}" aria-valuenow="${done}">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>

      <div class="card-surface">
        ${cardActions(S.lv?.key)}
        <div id="card-front" class="${cs.front}${rdOn ? ' rd-on' : ''} t-ink">
          ${frontHtml}
        </div>
        ${belowFront(isFlipped ? cardBack(card, cs, reads === null) : revealHint(), isChar)}
        ${S.grammarEditMode ? `<div class="text-xs text-center text-[var(--warn)] pt-3 border-t border-[var(--line-soft)] mt-2">문법 편집 모드 — 한자를 드래그해서 표시 영역을 선택하세요</div>` : ''}
      </div>

      <div class="flex flex-col items-center gap-3">
        ${S.side === 'back' ? ratingBtns : `
          <div class="text-sm t-faint">정답을 확인한 뒤 난이도를 선택하세요</div>`}
      </div>
    </div>`;
}

