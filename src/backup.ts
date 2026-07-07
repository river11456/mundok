import { store, exportUserData, importUserData } from './storage';

/**
 * 정적 배포(LocalStore) 모드에서만 노출되는 데이터 백업 메뉴.
 * 브라우저 저장은 기기/브라우저별이고 사파리 등에서 자동 삭제될 수 있으므로
 * 내보내기/가져오기로 사용자가 직접 보험을 들 수 있게 한다.
 */
export function initBackup(): void {
  // 관리자 저작(서버) 모드에서는 파일에 저장되므로 불필요
  if (store().kind !== 'local') return;

  // ── 팝오버 ────────────────────────────────────────────────
  const pop = document.createElement('div');
  pop.id = 'bk-pop';
  pop.className = 'fixed bottom-16 left-5 z-40 hidden bg-white border border-stone-200 rounded-xl shadow-lg p-2 flex flex-col gap-1 w-56';
  pop.innerHTML = `
    <button id="bk-export"
      class="text-left px-3 py-2 text-xs text-stone-700 rounded-lg hover:bg-stone-100 transition-colors">
      ⤓ 내 데이터 내보내기 (백업)
    </button>
    <button id="bk-import"
      class="text-left px-3 py-2 text-xs text-stone-700 rounded-lg hover:bg-stone-100 transition-colors">
      ⤒ 백업 파일에서 가져오기
    </button>
    <p class="px-3 pt-1 pb-1 text-[10px] leading-snug text-stone-400">
      추가·수정한 카드와 학습 기록은 이 브라우저에만 저장됩니다. 기기를 바꾸거나 기록을 지우기 전에 백업하세요.
    </p>`;
  document.body.appendChild(pop);

  // 숨겨진 파일 입력
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.className = 'hidden';
  document.body.appendChild(fileInput);

  // ── FAB (좌하단, ? 버튼과 겹치지 않게) ──────────────────────
  const fab = document.createElement('button');
  fab.id = 'bk-fab';
  fab.className = 'fixed bottom-5 left-5 w-8 h-8 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-500 hover:text-stone-700 text-sm flex items-center justify-center transition-colors z-40';
  fab.textContent = '⤓';
  fab.title = '데이터 백업';
  document.body.appendChild(fab);

  const hide = () => pop.classList.add('hidden');

  fab.addEventListener('click', e => {
    e.stopPropagation();
    pop.classList.toggle('hidden');
  });
  pop.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => hide());

  document.getElementById('bk-export')!.addEventListener('click', () => {
    exportUserData();
    hide();
  });

  document.getElementById('bk-import')!.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!confirm('현재 이 브라우저의 카드 데이터를 백업 파일 내용으로 덮어씁니다.\n계속하시겠습니까?')) {
      fileInput.value = '';
      return;
    }
    try {
      await importUserData(file);
      alert('복원했습니다. 페이지를 새로고침합니다.');
      location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    } finally {
      fileInput.value = '';
    }
  });
}
