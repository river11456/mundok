import { render, initShortcutHelp, initOnboarding } from './render';
import { setupClick, setupKeyboard } from './events';
import { initAddCard } from './addcard';
import { initEditCard } from './editcard';
import { initDocs } from './docs';

async function init() {
  await initDocs();
  initAddCard();
  initEditCard();
  initShortcutHelp();
  initOnboarding();
  setupClick();
  setupKeyboard();
  render();
}

init().catch(err => console.error('[문독] 초기화 실패:', err));
