import { reflowAt, type BookRect } from './library-drag-geometry';

interface Options {
  currentFolder: () => string | null;
  move: (id: string, folder: string | null, beforeId?: string | null) => boolean;
}
/** Touch uses a non-passive move listener only to cancel scrolling after the hold.
 * Do not toggle touch-action after pointerdown: browsers decide it at gesture start. */
export function initLibraryDrag(options: Options): void {
  let source: HTMLElement | null = null;
  let pointerId: number | null = null;
  let touch = false, active = false, sx = 0, sy = 0, x = 0, y = 0;
  let timer = 0, frame = 0, suppressUntil = 0;
  let ghost: HTMLElement | null = null, highlight: HTMLElement | null = null;
  let drop: { folder: string | null; before?: string | null } | null = null;
  let origin: string | null = null;
  let gripX = 0, gripY = 0;
  let slots: BookRect[] = [];
  let books: HTMLElement[] = [];
  let dragGrid: Element | null = null;
  let settling: HTMLElement | null = null;
  let settleTimer = 0, settleFrame = 0;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stopSettlement() {
    clearTimeout(settleTimer); cancelAnimationFrame(settleFrame); settling?.remove(); settling = null;
  }
  function settle(el: HTMLElement | null, target: HTMLElement | null, intoFolder = false) {
    stopSettlement();
    if (!el) return;
    if (!target?.isConnected || reducedMotion()) { el.remove(); return; }
    settling = el;
    const r = target.getBoundingClientRect();
    const scale = intoFolder ? .28 : 1;
    const left = intoFolder ? r.left + r.width / 2 - el.offsetWidth * scale / 2 : r.left;
    const top = intoFolder ? r.top + r.height / 2 - el.offsetHeight * scale / 2 : r.top;
    el.classList.remove('library-drag-over-folder');
    el.classList.add('library-drag-settling');
    el.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    el.style.opacity = intoFolder ? '0' : '1';
    const settledFolder = options.currentFolder();
    const watchDestination = () => {
      if (!target.isConnected || options.currentFolder() !== settledFolder) { stopSettlement(); return; }
      if (settling === el) settleFrame = requestAnimationFrame(watchDestination);
    };
    settleFrame = requestAnimationFrame(watchDestination);
    settleTimer = window.setTimeout(stopSettlement, 180);
  }
  function clearTarget() {
    highlight?.classList.remove('library-drop-target'); highlight = null;
    for (const book of books) book.style.removeProperty('transform');
    drop = null;
  }
  function cancel(animate = false) {
    stopSettlement();
    const returning = animate ? ghost : null;
    const cover = source?.querySelector<HTMLElement>('.cover') ?? null;
    if (animate) ghost = null;
    if (active) suppressUntil = Date.now() + 600;
    clearTimeout(timer); cancelAnimationFrame(frame); clearTarget();
    source?.classList.remove('library-drag-source'); ghost?.remove(); ghost = null;
    document.body.classList.remove('library-dragging'); source = null; active = false; pointerId = null;
    for (const book of books) book.classList.remove('library-reflow-item');
    books = []; slots = []; dragGrid = null;
    if (animate) settle(returning, cover);
  }
  function paint() {
    if (!source?.isConnected || options.currentFolder() !== origin) { cancel(); return; }
    if (ghost) ghost.style.transform = `translate(${x - gripX}px, ${y - gripY - 8}px) scale(1.035)`;
    const hit = document.elementFromPoint(x, y);
    const folder = hit?.closest<HTMLElement>('[data-library-folder]');
    ghost?.classList.toggle('library-drag-over-folder', !!folder && (folder.dataset.libraryFolder || null) !== origin);
    if (folder) {
      if ((folder.dataset.libraryFolder || null) === origin) { clearTarget(); return; }
      if (highlight !== folder) {
        clearTarget(); highlight = folder; folder.classList.add('library-drop-target');
      }
      drop = { folder: folder.dataset.libraryFolder || null }; return;
    }
    const grid = hit?.closest('.library-grid');
    if (!grid || grid !== dragGrid || hit?.closest('.folder-card')) { clearTarget(); return; }
    const preview = reflowAt(slots, source.dataset.libraryDoc!, x + window.scrollX, y + window.scrollY);
    if (!preview) { clearTarget(); return; }
    highlight?.classList.remove('library-drop-target'); highlight = null;
    drop = { folder: origin, before: preview.beforeId };
    for (let index = 0; index < books.length; index++) {
      const book = books[index];
      const destination = slots[preview.order.indexOf(slots[index].id)];
      const dx = destination.left - slots[index].left, dy = destination.top - slots[index].top;
      book.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
  function tick() {
    if (!active) return;
    const delta = y < 64 ? -10 : y > innerHeight - 64 ? 10 : 0;
    if (delta) window.scrollBy(0, delta);
    paint(); if (active) frame = requestAnimationFrame(tick);
  }
  function activate() {
    if (!source?.isConnected) { cancel(); return; }
    // Freeze the home entrance before measuring the slots or cloning the cover.
    source.closest('.home')?.classList.remove('screen-enter');
    dragGrid = source.closest('.library-grid');
    books = Array.from(dragGrid?.querySelectorAll<HTMLElement>('[data-library-doc]') ?? []);
    slots = books.map(book => {
      const r = book.getBoundingClientRect();
      return { id: book.dataset.libraryDoc!, left: r.left + window.scrollX, right: r.right + window.scrollX,
        top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    });
    for (const book of books) book.classList.add('library-reflow-item');
    active = true; source.classList.add('library-drag-source'); document.body.classList.add('library-dragging');
    const cover = source.querySelector<HTMLElement>('.cover');
    if (!cover) { cancel(); return; }
    const r = cover.getBoundingClientRect();
    gripX = sx - r.left; gripY = sy - r.top;
    ghost = document.createElement('div'); ghost.className = 'library-drag-preview';
    ghost.style.width = `${r.width}px`; ghost.style.height = `${r.height}px`;
    const clone = cover.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.key').forEach(el => el.remove());
    clone.style.transformOrigin = `${gripX}px ${gripY}px`;
    for (const el of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name.startsWith('on') || attr.name.startsWith('aria-')) el.removeAttribute(attr.name);
      }
      el.removeAttribute('autofocus'); el.setAttribute('tabindex', '-1');
    }
    ghost.append(clone); ghost.inert = true;
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
    const landingGhost = ghost, originalCover = source?.querySelector<HTMLElement>('.cover') ?? null;
    ghost = null; cancel();
    let changed = false;
    if (id && target) changed = options.move(id, target.folder, target.before);
    let destination = originalCover;
    if (changed && target) {
      document.querySelector('.home.screen-enter')?.classList.remove('screen-enter');
      destination = target.before === undefined
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-library-folder]')).find(el => (el.dataset.libraryFolder || null) === target.folder) ?? null
        : Array.from(document.querySelectorAll<HTMLElement>('[data-library-doc]')).find(el => el.dataset.libraryDoc === id)?.querySelector<HTMLElement>('.cover') ?? null;
    }
    settle(landingGhost, destination, changed && target?.before === undefined);
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
  document.addEventListener('touchcancel', () => cancel());
  document.addEventListener('click', e => {
    if (Date.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('dragstart', e => { if (source) e.preventDefault(); });
  document.addEventListener('contextmenu', e => { if (source) e.preventDefault(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && source) { e.preventDefault(); e.stopImmediatePropagation(); cancel(true); } }, true);
  window.addEventListener('blur', () => cancel());
  window.addEventListener('resize', () => cancel());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
}
