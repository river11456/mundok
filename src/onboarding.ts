// ── Onboarding ────────────────────────────────────────────
import { isOnboardingSeen, markOnboardingSeen } from './state';
import { installStarterDoc } from './docs';
import { render } from './render';

const OB_SLIDES: { title: string; html: string }[] = [
  {
    title: '학습 시작하기',
    html: `
      <div class="flex flex-col items-center gap-1.5 text-sm">
        ${['문헌 선택','모드 선택','단위 선택','학습'].map((s, i, a) =>
          `<span class="px-5 py-2 bg-[rgba(0,0,0,.05)] rounded-xl t-ink w-32 text-center">${s}</span>${i < a.length-1 ? '<span class="t-faint text-xs">↓</span>' : ''}`
        ).join('')}
      </div>
      <p class="text-sm t-sub leading-relaxed mt-4 text-center">
        순차 모드는 카드를 차례로 넘기며 공부하고,<br>
        안키 모드는 모르는 카드를 집중 반복합니다.
      </p>`,
  },
  {
    title: '안키 모드',
    html: `
      <div class="flex justify-center gap-3">
        ${[
          ['Space','뒤집기','bg-[rgba(0,0,0,.05)]','t-ink',''],
          ['1','어려움','bg-[rgba(215,0,21,.05)]','text-[var(--fail)]','border border-[rgba(215,0,21,.25)]'],
          ['2','보통','bg-[rgba(178,80,0,.06)]','text-[var(--warn)]','border border-[rgba(178,80,0,.25)]'],
          ['3','쉬움','bg-[var(--o-bg)]','text-[var(--o-fg)]','border border-[rgba(29,122,51,.28)]'],
        ].map(([k,l,bg,tc,b]) =>
          `<div class="flex flex-col items-center gap-1.5">
            <kbd class="px-3 py-2 ${bg} ${tc} ${b} rounded-lg font-mono text-sm">${k}</kbd>
            <span class="text-xs t-faint">${l}</span>
          </div>`
        ).join('')}
      </div>
      <p class="text-sm t-sub leading-relaxed mt-5 text-center">
        어려움·보통으로 평가한 카드는 다시 출제되고<br>쉬움은 오늘 학습 완료로 처리됩니다.
      </p>`,
  },
  {
    title: '드릴다운',
    html: `
      <div class="text-center hanja text-2xl t-ink leading-loose">
        凡<span class="border-b-2 border-[var(--faint)]">大醫</span><span class="border-b-2 border-[var(--faint)]">治病</span>必先<span class="border-b-2 border-[var(--faint)]">定志</span>
      </div>
      <p class="text-sm t-sub leading-relaxed mt-5 text-center">
        문장·단락 카드에서 <span class="border-b border-[var(--sub)]">밑줄 친 한자</span>를 클릭하면<br>
        해당 글자·단어 카드로 바로 이동합니다.<br>
        <span class="font-mono text-xs bg-[rgba(0,0,0,.05)] px-1.5 py-0.5 rounded">Esc</span> 키나 왼쪽 위 뒤로가기로 원래 카드로 돌아옵니다.
      </p>`,
  },
  {
    title: '카드 추가·수정',
    html: `
      <div class="flex flex-col gap-3 text-sm">
        ${[
          ['추가','앞면 한자를 긋거나(터치는 살짝 눌렀다 끌기) 한 글자를 잠깐 누르면 "+ 카드 추가" 버블이 나타납니다'],
          ['수정·삭제','카드 우상단 아이콘 버튼으로 수정하거나 삭제할 수 있습니다'],
        ].map(([label, desc]) =>
          `<div class="flex items-start gap-3">
            <span class="text-xs font-bold t-faint pt-0.5 w-14 shrink-0">${label}</span>
            <span class="t-sub leading-relaxed">${desc}</span>
          </div>`
        ).join('')}
      </div>`,
  },
  {
    title: '샘플 문헌으로 시작하기',
    html: `
      <p class="text-sm t-sub leading-relaxed text-center">
        뜻·문법·해석 순서가 채워진 대표 문헌으로<br>바로 학습을 시작해 보세요.<br>
        더 많은 문헌은 홈의 <b class="t-ink">문헌 받기</b>에 있습니다.
      </p>
      <div class="flex justify-center mt-5">
        <button id="ob-starter" class="btn-primary"><span class="hanja">不治已病治未病</span> 담기</button>
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
    `<div class="w-1.5 h-1.5 rounded-full transition-colors ${i === _obIdx ? 'bg-[var(--ink)]' : 'bg-[rgba(0,0,0,.12)]'}"></div>`
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
  overlay.className = 'modal-backdrop z-50 hidden';
  overlay.innerHTML = `
    <div id="ob-panel" class="modal-surface w-full max-w-sm mx-4" role="dialog" aria-modal="true" aria-label="사용법 안내">
      <div class="px-8 pt-8 pb-6">
        <div id="ob-title" class="text-base font-bold t-ink mb-5"></div>
        <div id="ob-content" class="min-h-[140px]"></div>
      </div>
      <div class="px-8 pb-8 flex flex-col gap-4">
        <div class="flex justify-center gap-1.5" id="ob-dots"></div>
        <div class="flex justify-between items-center">
          <button id="ob-prev" class="text-sm t-sub hover:text-[var(--ink)] transition-colors">← 이전</button>
          <button id="ob-next" class="btn-primary"></button>
        </div>
      </div>
    </div>`;

  const panel = overlay.querySelector<HTMLElement>('#ob-panel')!;
  panel.addEventListener('click', e => e.stopPropagation());

  // 스타터 설치 (C8) — 슬라이드가 리렌더돼도 살아있게 패널에 위임
  panel.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('#ob-starter');
    if (!btn || btn.disabled) return;
    installStarterDoc();
    render();   // 온보딩 뒤 홈 서가에 표지 반영
    btn.textContent = '담았습니다 ✓';
    btn.disabled = true;
  });
  overlay.addEventListener('click', () => {
    markOnboardingSeen();
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
      markOnboardingSeen();
      hideOnboarding();
    }
  });

  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (overlay.classList.contains('hidden')) return;
    if (e.code === 'Space' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (_obIdx < OB_SLIDES.length - 1) { _obIdx++; _obRender(); }
      else { markOnboardingSeen(); hideOnboarding(); }
    } else if (e.key === 'ArrowLeft') {
      if (_obIdx > 0) { _obIdx--; _obRender(); }
    } else if (e.key === 'Escape') {
      markOnboardingSeen();
      hideOnboarding();
    }
  });

  // 가이드 FAB (? 버튼 위)
  const guide = document.createElement('button');
  guide.className = 'fixed bottom-14 right-5 w-8 h-8 rounded-full bg-[rgba(0,0,0,.07)] hover:bg-[rgba(0,0,0,.12)] t-sub hover:text-[var(--ink)] flex items-center justify-center transition-colors z-40';
  guide.title = '사용법 보기';
  guide.setAttribute('aria-label', '사용법 보기');
  guide.innerHTML = `<svg width="15" height="15" viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="1" width="9" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
    <path d="M4 4.5H8M4 7H7M4 9.5H6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M10.5 4.5L12.5 6.5L10.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  guide.addEventListener('click', showOnboarding);
  document.body.appendChild(guide);

  // 첫 방문 자동 표시
  if (!isOnboardingSeen()) showOnboarding();
}
