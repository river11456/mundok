// ── Shortcut help modal ───────────────────────────────────
export function initShortcutHelp(): void {
  const el = document.createElement('div');
  el.id = 'shortcut-help';
  el.className = 'modal-backdrop z-50 hidden';
  el.innerHTML = `
    <div id="sh-panel" class="modal-surface px-8 py-7 w-full max-w-xs mx-4" role="dialog" aria-modal="true" aria-label="키보드 단축키">
      <div class="text-sm font-bold t-ink mb-5">키보드 단축키</div>
      <table class="w-full text-xs t-sub border-separate" style="border-spacing:0 6px">
        <tbody>
          <tr><td class="t-faint pr-4 whitespace-nowrap">홈</td><td class="kbd mr-2">1–N</td><td>문헌 선택</td></tr>
          <tr><td class="t-faint pr-4">모드</td><td class="kbd mr-2">1 / 2</td><td>순차 / 안키</td></tr>
          <tr><td class="t-faint pr-4">단위</td><td class="kbd mr-2">1–N</td><td>단위 선택</td></tr>
          <tr><td colspan="3" class="pt-2 pb-1 t-faint text-xs">순차 모드</td></tr>
          <tr><td></td><td class="kbd mr-2">Space</td><td>뒤집기</td></tr>
          <tr><td></td><td class="kbd mr-2">← →</td><td>이전 / 다음</td></tr>
          <tr><td colspan="3" class="pt-2 pb-1 t-faint text-xs">안키 모드</td></tr>
          <tr><td></td><td class="kbd mr-2">Space</td><td>뒤집기</td></tr>
          <tr><td></td><td class="kbd mr-2">1 / 2 / 3</td><td>어려움 / 보통 / 쉬움</td></tr>
          <tr><td></td><td class="kbd mr-2">R</td><td>다시 시작 (결과 화면)</td></tr>
          <tr><td colspan="3" class="pt-2 pb-1 t-faint text-xs">전체</td></tr>
          <tr><td></td><td class="kbd mr-2">G</td><td>문법 표시 (문장 카드)</td></tr>
          <tr><td></td><td class="kbd mr-2">Esc</td><td>뒤로가기</td></tr>
          <tr><td></td><td class="kbd mr-2">?</td><td>단축키 도움말</td></tr>
          <tr><td></td><td class="kbd mr-2 t-faint" style="font-size:10px">Ctrl⇧R</td><td>안키 기록 초기화</td></tr>
        </tbody>
      </table>
      <div class="mt-5 text-center text-xs t-sub">Esc 또는 ? 로 닫기</div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) hideShortcutHelp(); });
  el.querySelector('#sh-panel')?.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(el);

  const fab = document.createElement('button');
  fab.id = 'sh-fab';
  fab.className = 'fixed bottom-5 right-5 w-8 h-8 rounded-full bg-[rgba(0,0,0,.07)] hover:bg-[rgba(0,0,0,.12)] t-sub hover:text-[var(--ink)] text-sm font-bold flex items-center justify-center transition-colors z-40';
  fab.textContent = '?';
  fab.setAttribute('aria-label', '키보드 단축키 도움말');
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
