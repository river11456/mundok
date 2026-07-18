export const $app = (): HTMLElement => document.getElementById('app')!;

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function backBtn(label: string): string {
  return `<button data-action="nav-back" class="btn-back">
    <svg class="shrink-0" width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="truncate">${esc(label)}</span>
  </button>`;
}

export function homeBtn(): string {
  return `<button data-action="nav-home" class="icon-btn">
    <svg width="13" height="13" viewBox="0 0 11 11" fill="currentColor">
      <path d="M5.5 1L0.5 5.5H2V10H4.5V7H6.5V10H9V5.5H10.5L5.5 1Z"/>
    </svg>
    홈
  </button>`;
}
