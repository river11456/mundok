import { render, initShortcutHelp, initOnboarding } from './render';
import { setupClick, setupKeyboard } from './events';
import { initAddCard } from './addcard';
import { initEditCard } from './editcard';
import { initDocs } from './docs';
import { initGrammarEdit } from './grammar-edit';
import { initBackup } from './backup';

async function init() {
  await initDocs();        // store 초기화 + 콘텐츠 병합
  initAddCard();
  initEditCard();
  initGrammarEdit();
  initShortcutHelp();
  initOnboarding();
  initBackup();            // 정적 모드에서만 백업 FAB 노출
  setupClick();
  setupKeyboard();
  render();
}

init().catch(err => console.error('[문독] 초기화 실패:', err));
