import { insertionAt } from './library-drag-geometry';

interface Options {
  currentFolder: () => string | null;
  move: (id: string, folder: string | null, beforeId?: string | null) => void;
}
/** Touch uses a non-passive move listener only to cancel scrolling after the hold.
 * Do not toggle touch-action after pointerdown: browsers decide it at gesture start. */
export function initLibraryDrag(options: Options): void {
  let source: HTMLElement | null = null;
  let pointerId: number | null = null;
  let touch = false, active = false, sx = 0, sy = 0, x = 0, y = 0;
  let timer = 0, frame = 0, suppressUntil = 0;
  let ghost: HTMLElement | null = null, marker: HTMLElement | null = null, highlight: HTMLElement | null = null;
  let drop: { folder: string | null; before?: string | null } | null = null;
  let origin: string | null = null;
  function clearTarget() {
    highlight?.classList.remove('library-drop-target'); highlight = null;
    marker?.remove(); marker = null; drop = null;
  }
  function cancel() {
    if (active) suppressUntil = Date.now() + 600;
    clearTimeout(timer); cancelAnimationFrame(frame); clearTarget();
    source?.classList.remove('library-drag-source'); ghost?.remove(); ghost = null;
    document.body.classList.remove('library-dragging'); source = null; active = false; pointerId = null;
  }
  function paint() {
    clearTarget();
    if (!source?.isConnected || options.currentFolder() !== origin) { cancel(); return; }
    if (ghost) ghost.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
    const hit = document.elementFromPoint(x, y);
    const folder = hit?.closest<HTMLElement>('[data-library-folder]');
    if (folder) {
      highlight = folder; folder.classList.add('library-drop-target');
      drop = { folder: folder.dataset.libraryFolder || null }; return;
    }
    const grid = hit?.closest('.library-grid');
    if (!grid || hit?.closest('.folder-card')) return;
    const books = Array.from(grid.querySelectorAll<HTMLElement>('[data-library-doc]'))
      .map(el => ({ id: el.dataset.libraryDoc!, ...rect(el) }));
    const insertion = insertionAt(books, x, y);
    if (!insertion) return;
    drop = { folder: origin, before: insertion.beforeId };
    marker = document.createElement('div'); marker.className = 'library-insertion';
    const r = insertion.anchor;
    Object.assign(marker.style, { left: `${(insertion.after ? r.right : r.left) - 2}px`, top: `${r.top}px`, height: `${r.bottom - r.top}px` });
    document.body.append(marker);
  }
  function rect(el: HTMLElement) {
    const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }
  function tick() {
    if (!active) return;
    const delta = y < 64 ? -10 : y > innerHeight - 64 ? 10 : 0;
    if (delta) window.scrollBy(0, delta);
    paint(); if (active) frame = requestAnimationFrame(tick);
  }
  function activate() {
    if (!source?.isConnected) { cancel(); return; }
    active = true; source.classList.add('library-drag-source'); document.body.classList.add('library-dragging');
    ghost = document.createElement('div'); ghost.className = 'library-drag-preview';
    ghost.textContent = source.querySelector('.slip')?.textContent ?? '문헌 이동';
    ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost); tick();
  }
  function start(target: EventTarget | null, px: number, py: number, isTouch: boolean) {
    if (!(target instanceof Element) || !target.closest('.cover')) return;
    cancel(); source = target.closest<HTMLElement>('[data-library-doc]');
    if (!source) return;
    touch = isTouch; sx = x = px; sy = y = py; origin = options.currentFolder();
    if (touch) timer = window.setTimeout(activate, 300);
  }
  function move(px: number, py: number) {
    if (!source) return;
    x = px; y = py;
    if (!active && Math.hypot(x - sx, y - sy) >= 8) {
      if (touch) cancel(); else activate();
    }
    if (active) paint();
  }
  function finish() {
    if (active) paint();
    const id = source?.dataset.libraryDoc, target = active ? drop : null;
    cancel();
    if (id && target) options.move(id, target.folder, target.before);
  }
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && e.isPrimary && e.button === 0) {
      start(e.target, e.clientX, e.clientY, false);
      if (source) pointerId = e.pointerId;
    }
  });
  document.addEventListener('pointermove', e => {
    if (!touch && e.pointerId === pointerId) {
      if (!(e.buttons & 1)) { cancel(); return; }
      move(e.clientX, e.clientY); if (active) e.preventDefault();
    }
  });
  document.addEventListener('pointerup', e => { if (!touch && e.pointerId === pointerId) { x = e.clientX; y = e.clientY; finish(); } });
  document.addEventListener('pointercancel', e => { if (e.pointerId === pointerId) cancel(); });
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { cancel(); return; }
    start(e.target, e.touches[0].clientX, e.touches[0].clientY, true);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!touch || !source) return;
    if (e.touches.length !== 1) { cancel(); return; }
    move(e.touches[0].clientX, e.touches[0].clientY);
    if (active) { if (e.cancelable) e.preventDefault(); else cancel(); }
  }, { passive: false });
  document.addEventListener('touchend', e => { if (touch) { if (active && e.cancelable) e.preventDefault(); finish(); } }, { passive: false });
  document.addEventListener('touchcancel', cancel);
  document.addEventListener('click', e => {
    if (Date.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('dragstart', e => { if (source) e.preventDefault(); });
  document.addEventListener('contextmenu', e => { if (source) e.preventDefault(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && source) { e.preventDefault(); e.stopImmediatePropagation(); cancel(); } }, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
}
