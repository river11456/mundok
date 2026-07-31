import type { InterpChunk } from './types';

// ── 해석 순서 재생 — 렌더된 글자 셀(.cc[data-i])에 DOM 클래스만 토글 ──────
//   render() 를 부르지 않으므로 재생 중 배치가 흔들리지 않는다 (char-cell R1~R3).
//   반대로 어떤 이유로든 render() 가 실행되면 셀이 재생성되므로, render() 는
//   진입부에서 stopInterpPlay() 를 호출해 타이머·상태를 정리한다 (상호작용 = 중단).

const STEP_MS = 700;

let _timer: ReturnType<typeof setTimeout> | null = null;
let _playing = false;

export function isInterpPlaying(): boolean {
  return _playing;
}

/** 재생 중단 + DOM 원상 복귀. 재생 중이 아니면 no-op. 언제 불러도 안전. */
export function stopInterpPlay(): void {
  if (_timer !== null) { clearTimeout(_timer); _timer = null; }
  if (!_playing) return;
  _playing = false;
  document.querySelector('[data-action="interp-play"]')?.classList.remove('on');
  const host = document.getElementById('card-front');
  if (!host) return;
  host.classList.remove('interp-playing');
  host.querySelectorAll('.ip-dim, .ip-on, .ip-now').forEach(el => el.classList.remove('ip-dim', 'ip-on', 'ip-now'));
  host.querySelectorAll('.ip-num').forEach(el => el.remove());
}

/** ▶ 버튼 — 재생 시작, 재생 중이면 중단. */
export function toggleInterpPlay(chunks: InterpChunk[] | undefined): void {
  if (_playing) { stopInterpPlay(); return; }
  if (!chunks?.length) return;
  const host = document.getElementById('card-front');
  if (!host) return;

  const cells = new Map<number, HTMLElement>();
  host.querySelectorAll<HTMLElement>('.cc[data-i]').forEach(el => cells.set(parseInt(el.dataset.i!), el));
  if (cells.size === 0) return;

  _playing = true;
  host.classList.add('interp-playing');
  document.querySelector('[data-action="interp-play"]')?.classList.add('on');
  cells.forEach(el => el.classList.add('ip-dim'));

  const lightUp = (k: number): void => {
    host.querySelectorAll('.ip-now').forEach(el => el.classList.remove('ip-now'));
    const c = chunks[k];
    for (let i = c.start; i < c.end; i++) {
      const el = cells.get(i);
      if (!el) continue;
      el.classList.remove('ip-dim');
      el.classList.add('ip-on', 'ip-now');
      if (i === c.start) {
        const b = document.createElement('span');
        b.className = 'ip-num num';
        b.textContent = String(k + 1);
        el.appendChild(b);
      }
    }
  };

  // 모션 최소화 환경: 애니메이션 대신 전체 순번을 정적으로 표시 — 다시 누르면 해제
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    chunks.forEach((_, k) => lightUp(k));
    host.querySelectorAll('.ip-now').forEach(el => el.classList.remove('ip-now'));
    return;
  }

  let step = 0;
  const tick = (): void => {
    if (!_playing) return;
    lightUp(step);
    step++;
    _timer = step < chunks.length
      ? setTimeout(tick, STEP_MS)
      : setTimeout(stopInterpPlay, STEP_MS * 2);   // 마지막 청크 뒤 잠깐 여운 후 원상 복귀
  };
  tick();
}
