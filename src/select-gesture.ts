/**
 * 셀 기반 범위 선택 제스처 상태 기계 (카드 추가 저작).
 * 네이티브 텍스트 선택(드래그·롱프레스·콜아웃)을 대체 — 포인터 종류별 진입 규칙만
 * 다르고 이후 스윕은 공통. DOM·타이머 없이 전이만 담당한다 (cell-select.ts가 배선).
 *
 *  - mouse·pen: 셀을 누르고 SLOP 이상 움직이면 선택 시작 (무이동 클릭 = 플립/드릴 유지)
 *  - touch:     HOLD_MS 홀드(그대로 떼면 한 글자) 또는 가로 우세 이동으로 시작.
 *               세로 우세 이동은 스크롤 의도로 보고 해제한다 (가로 스크롤은 앱에 없음)
 */
export type PointerKind = 'mouse' | 'pen' | 'touch';

export type GestureResult =
  | { act: 'none' }
  | { act: 'update'; start: number; end: number }   // 선택 진행 — 하이라이트 갱신
  | { act: 'select'; start: number; end: number }   // 확정 (end 포함 인덱스)
  | { act: 'tap' }                                  // 선택 아님 — 클릭 통과
  | { act: 'dismiss' };                             // 스크롤 양보·취소

export const SLOP_PX = 8;    // 이내 움직임은 탭/홀드로 간주
export const HOLD_MS = 220;  // 터치 홀드 진입 — iOS 롱프레스(~500ms)보다 빠르게
const HORIZ_PX = 12;         // 터치 가로 fast-path 진입 거리

export class SelectGesture {
  private kind: PointerKind = 'mouse';
  private anchor = -1;
  private last   = -1;
  private active = false;
  private sx = 0;
  private sy = 0;

  get isArmed(): boolean  { return this.anchor >= 0; }
  get isActive(): boolean { return this.active; }
  get armedKind(): PointerKind | null { return this.isArmed ? this.kind : null; }

  down(kind: PointerKind, cellIdx: number, x: number, y: number): void {
    this.kind   = kind;
    this.anchor = cellIdx;
    this.last   = cellIdx;
    this.active = false;
    this.sx = x;
    this.sy = y;
  }

  move(cellIdx: number, x: number, y: number): GestureResult {
    if (!this.isArmed) return { act: 'none' };
    if (cellIdx >= 0) this.last = cellIdx;
    if (this.active) return { act: 'update', ...this.range() };

    const dx = Math.abs(x - this.sx);
    const dy = Math.abs(y - this.sy);
    if (this.kind === 'touch') {
      if (dx >= HORIZ_PX && dx > dy * 1.5) { this.active = true; return { act: 'update', ...this.range() }; }
      if (dy >= SLOP_PX && dy > dx)        { this.reset();       return { act: 'dismiss' }; }
      return { act: 'none' };
    }
    if (dx >= SLOP_PX || dy >= SLOP_PX) { this.active = true; return { act: 'update', ...this.range() }; }
    return { act: 'none' };
  }

  /** 터치 홀드 타이머 만료 — 아직 선택 전이면 앵커 한 글자로 선택 시작 */
  holdFired(): GestureResult {
    if (!this.isArmed || this.active || this.kind !== 'touch') return { act: 'none' };
    this.active = true;
    return { act: 'update', ...this.range() };
  }

  up(): GestureResult {
    if (!this.isArmed) return { act: 'none' };
    const r: GestureResult = this.active ? { act: 'select', ...this.range() } : { act: 'tap' };
    this.reset();
    return r;
  }

  cancel(): GestureResult {
    if (!this.isArmed) return { act: 'none' };
    this.reset();
    return { act: 'dismiss' };
  }

  private range(): { start: number; end: number } {
    return { start: Math.min(this.anchor, this.last), end: Math.max(this.anchor, this.last) };
  }

  private reset(): void {
    this.anchor = -1;
    this.last   = -1;
    this.active = false;
  }
}
