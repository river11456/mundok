import { render } from './render';
import { DOCS, syncUserDocs, COVER_PALETTE } from './docs';
import { loadUserDocs, installCatalogDoc } from './user-docs';
import { esc } from './render-shared';
import type { DocJSON } from './types';

/**
 * 문헌 받기 — 카탈로그 브라우저 (ct-overlay, 정적 모드 전용).
 * 카탈로그 = 앱과 같은 origin의 dist/catalog/(index.json + <id>.json) 정적 파일.
 * SW가 same-origin GET을 캐싱하므로 목록은 ?t=, 문헌은 ?v=<version>으로 캐시 버스팅.
 * 설치본은 user-docs에 source 메타와 함께 저장 — 이후 자유 편집 가능, 카드 id가
 * 유지되므로 업데이트(통째 교체)에도 학습기록이 살아남는다.
 */

interface CatalogEntry {
  id: string; title: string; sub: string;
  color?: string; version: number; cards: number;
}

let overlay: HTMLElement | null = null;
let entries: CatalogEntry[] | null = null;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function ensureOverlay(): HTMLElement {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'ct-overlay';
  overlay.className = 'modal-backdrop z-50 hidden';
  overlay.innerHTML = `
    <div id="ct-modal" class="modal-surface px-5 py-6 sm:px-8 sm:py-8 w-full max-w-md flex flex-col gap-5 mx-4" role="dialog" aria-modal="true" aria-label="문헌 받기">
      <div class="flex items-center justify-between">
        <div class="text-sm font-bold t-ink">문헌 받기</div>
        <button id="ct-close" class="icon-btn" title="닫기" aria-label="닫기">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div id="ct-body" class="flex flex-col gap-2"></div>
    </div>`;
  document.body.appendChild(overlay);

  $('ct-modal').addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', hideCatalog);
  $('ct-close').addEventListener('click', hideCatalog);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
      e.stopPropagation();
      hideCatalog();
    }
  }, true);

  $('ct-body').addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-ct]');
    if (btn && !btn.disabled) install(btn.dataset.ct!, btn);
    if ((e.target as Element).closest('#ct-retry')) loadIndex();
  });

  return overlay;
}

export function hideCatalog(): void {
  overlay?.classList.add('hidden');
}

export function isCatalogOpen(): boolean {
  return overlay !== null && !overlay.classList.contains('hidden');
}

export function showCatalog(): void {
  ensureOverlay().classList.remove('hidden');
  if (entries) renderList();
  else loadIndex();
}

async function loadIndex(): Promise<void> {
  $('ct-body').innerHTML = `<div class="text-sm t-sub py-6 text-center">목록을 불러오는 중…</div>`;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}catalog/index.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const idx = await res.json() as { docs?: CatalogEntry[] };
    entries = Array.isArray(idx.docs) ? idx.docs : [];
    renderList();
  } catch {
    $('ct-body').innerHTML = `
      <div class="text-sm t-sub py-6 text-center flex flex-col items-center gap-3">
        <span>목록을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.</span>
        <button id="ct-retry" class="btn-ghost">다시 시도</button>
      </div>`;
  }
}

/** 항목별 버튼 상태 — 설치 여부·버전 비교 */
function stateFor(e: CatalogEntry): { label: string; disabled: boolean } {
  const mine = loadUserDocs().find(d => d.id === e.id);
  if (mine?.source?.catalogId === e.id) {
    return mine.source.version >= e.version
      ? { label: '설치됨', disabled: true }
      : { label: '업데이트', disabled: false };
  }
  if (mine) return { label: '이미 있음', disabled: true };                     // 동일 id의 사용자 문헌
  if (DOCS.some(d => d.id === e.id && !d.userDoc)) return { label: '내장됨', disabled: true };
  return { label: '받기', disabled: false };
}

function renderList(): void {
  if (!entries || entries.length === 0) {
    $('ct-body').innerHTML = `<div class="text-sm t-sub py-6 text-center">아직 등록된 문헌이 없습니다.</div>`;
    return;
  }
  $('ct-body').innerHTML = entries.map((e, i) => {
    const st = stateFor(e);
    return `
    <div class="ct-item">
      <span class="ct-chip" style="background:${e.color ?? COVER_PALETTE[i % COVER_PALETTE.length]}"></span>
      <div class="ct-info">
        <div class="ct-title kai hanja">${esc(e.title)}</div>
        <div class="ct-sub">${esc(e.sub)} · <span class="num">${e.cards}장</span></div>
      </div>
      <button data-ct="${esc(e.id)}" class="${st.disabled ? 'btn-ghost' : 'btn-primary'} ct-btn" ${st.disabled ? 'disabled' : ''}>${st.label}</button>
    </div>`;
  }).join('');
}

async function install(id: string, btn: HTMLButtonElement): Promise<void> {
  const entry = entries?.find(e => e.id === id);
  if (!entry) return;
  const updating = stateFor(entry).label === '업데이트';
  if (updating && !confirm('업데이트하면 이 문헌에 직접 수정한 내용은 사라집니다. (학습 기록은 유지) 계속할까요?')) return;

  btn.disabled = true;
  btn.textContent = '받는 중…';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}catalog/${encodeURIComponent(id)}.json?v=${entry.version}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dj = await res.json() as DocJSON;
    if (dj.id !== id || typeof dj.title !== 'string' || typeof dj.levels !== 'object' || dj.levels === null) {
      throw new Error('문헌 파일 형식이 올바르지 않습니다');
    }
    installCatalogDoc(dj, { catalogId: id, version: entry.version });
    syncUserDocs();
    renderList();   // '설치됨'으로 갱신
    render();       // 뒤 홈 화면에 새 표지 반영
  } catch (err) {
    alert(err instanceof Error ? `받기에 실패했습니다: ${err.message}` : '받기에 실패했습니다.');
    renderList();
  }
}
