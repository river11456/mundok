import './style.css';
import { render, initShortcutHelp, initOnboarding } from './render';
import { setupClick, setupKeyboard } from './events';
import { initAddCard } from './addcard';
import { initEditCard } from './editcard';
import { initDocs } from './docs';
import { initGrammarEdit } from './grammar-edit';
import { initBackup } from './backup';

async function registerServiceWorker() {
  // 개발 모드(server.py + vite watch)에서는 등록하지 않음 — 라이브 리로드와 충돌 방지
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    /* 오프라인 캐싱 불가해도 앱 자체는 정상 동작 */
  }
}

async function requestPersistentStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 미지원 브라우저는 무시 */
  }
}

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
  registerServiceWorker();
  requestPersistentStorage();
}

init().catch(err => console.error('[문독] 초기화 실패:', err));
