// Run against vite with an existing Playwright installation; no app dependency.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const url = process.env.LIBRARY_TEST_URL || 'http://127.0.0.1:5184';
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.locator('.home').waitFor();
  await page.evaluate(() => {
   localStorage.clear();
   localStorage.setItem('mundok-v3/docs', JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ id: `visual-${i}`, title: ['大醫精誠', '養性篇', '不治已病治未病'][i % 3], sub: `문헌 ${i}`, color: ['#F8E3D1', '#E3EDD9', '#DCE8F2'][i % 3], levels: { sentence: [] } }))));
   localStorage.setItem('mundok-v3/collections', JSON.stringify([{ id: 'folder', name: '강독', docIds: [] }]));
   localStorage.setItem('mundok-v3/prefs', JSON.stringify({ onboardingSeen: true, shelvesCollapsed: [] }));
   localStorage.setItem('mundok-v3/session', JSON.stringify({ last: null, streak: { lastDate: '', count: 0, todayCards: 0 } }));
  });
  await page.reload(); await page.locator('[data-library-doc]').first().waitFor();
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  const source = page.locator('[data-library-doc="visual-0"] .cover');
  const ids = () => page.locator('[data-library-doc]').evaluateAll(els => els.map(el => el.dataset.libraryDoc));
  const initial = await ids();
  async function begin() {
   await source.scrollIntoViewIfNeeded(); const b = await source.boundingBox();
   await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
   await page.mouse.move(b.x + b.width / 2 + 12, b.y + b.height / 2 + 12);
  }
  async function over(locator, fraction = .5) {
   const b = await locator.boundingBox(); await page.mouse.move(b.x + b.width * fraction, b.y + b.height / 2, { steps: 12 });
  }
  async function clean() {
   await page.waitForTimeout(350);
   assert.equal(await page.locator('.library-drag-preview, .library-drop-target, .library-drag-source, .library-reflow-item').count(), 0);
   assert.equal(await page.locator('body.library-dragging').count(), 0);
  }
  await begin();
  const ghost = page.locator('.library-drag-preview');
  assert.equal(await ghost.locator('.slip').innerText(), await source.locator('.slip').innerText());
  assert.equal(await ghost.getAttribute('aria-hidden'), 'true');
  assert.equal(await ghost.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  assert.equal(await ghost.locator('[id], [data-action], .book-organize').count(), 0);
  assert.equal(await ghost.evaluate(el => el.inert), true);
  assert.equal(await ghost.locator('.cover').evaluate(el => getComputedStyle(el).backgroundColor), await source.evaluate(el => getComputedStyle(el).backgroundColor));
  // Fixed original slots let us verify the preview independently of moving hit targets.
  await page.keyboard.press('Escape'); await page.mouse.up(); await clean();
  const slots = await page.locator('[data-library-doc]').evaluateAll(els => els.map(el => {
   const r = el.getBoundingClientRect(); return { id: el.dataset.libraryDoc, x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  const rects = () => page.locator('[data-library-doc]').evaluateAll(els => els.map(el => {
   const r = el.getBoundingClientRect(); return { id: el.dataset.libraryDoc, x: r.x, y: r.y };
  }));
  function near(actual, expected) { assert(Math.abs(actual - expected) < 1, `${actual} differs from ${expected}`); }
  function atSlot(actual, slot) { near(actual.x, slot.x); near(actual.y, slot.y); }
  assert(slots[6].y > slots[0].y, 'fixture must cross rows');
  await page.waitForTimeout(650); await begin();
  await page.mouse.move(slots[6].x + slots[6].width / 2, slots[6].y + 50, { steps: 18 });
  await page.waitForTimeout(300);
  const moved = await rects();
  for (let i = 1; i <= 6; i++) atSlot(moved[i], slots[i - 1]);
  for (let i = 7; i < slots.length; i++) atSlot(moved[i], slots[i]);
  assert.equal(await page.locator('.library-insertion').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), saved, 'hover must not persist');
  await page.waitForTimeout(400); assert.deepEqual(await rects(), moved, 'stationary pointer must not oscillate');
  await page.keyboard.press('Escape'); await page.mouse.up(); await clean();
  (await rects()).forEach((rect, i) => atSlot(rect, slots[i])); assert.deepEqual(await ids(), initial);
  console.log('PASS real inert cover clone, full cross-row reflow, stable vacancy, deferred persistence and cancel restoration');
  await page.waitForTimeout(650); await begin();
  await page.mouse.move(slots[6].x + slots[6].width / 2, slots[6].y + 50, { steps: 18 });
  await page.waitForTimeout(250); await page.mouse.up(); await clean();
  const reordered = [...initial.slice(1, 7), initial[0], ...initial.slice(7)];
  assert.deepEqual(await ids(), reordered);
  await page.reload(); await page.locator('[data-library-doc]').first().waitFor(); await page.waitForTimeout(400);
  assert.deepEqual(await ids(), reordered);
  // Moving back across the row boundary uses the same full-slot preview.
  const first = await page.locator('[data-library-doc]').first().boundingBox();
  await begin(); await page.mouse.move(first.x + first.width / 2, first.y + 50, { steps: 18 });
  await page.waitForTimeout(250); await page.mouse.up(); await clean(); assert.deepEqual(await ids(), initial);
  console.log('PASS forward/backward cross-row drop and reload persistence');
  await page.waitForTimeout(650); await page.emulateMedia({ reducedMotion: 'reduce' }); await begin();
  await page.mouse.move(slots[6].x + slots[6].width / 2, slots[6].y + 50);
  const reduced = await rects();
  for (let i = 1; i <= 6; i++) atSlot(reduced[i], slots[i - 1]);
  assert(await page.locator('.library-reflow-item').first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) <= .00001));
  await over(page.locator('[data-library-folder="folder"]'));
  (await rects()).forEach((rect, i) => atSlot(rect, slots[i]));
  await page.setViewportSize({ width: 1000, height: 1000 }); await page.mouse.up(); await clean();
  assert.deepEqual(await ids(), initial);
  await page.setViewportSize({ width: 1100, height: 1000 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('PASS reduced-motion reflow, folder-hover restoration and resize cancellation');
  await page.waitForTimeout(650); await begin(); await over(page.locator('[data-library-folder="folder"]'));
  assert.equal(await page.locator('.library-drop-target').count(), 1);
  assert.equal(await page.locator('.library-drop-target').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  await page.mouse.up(); await clean(); assert(!(await ids()).includes('visual-0'));
  console.log('PASS soft destination and committed move settlement');
  await page.waitForTimeout(650); await page.locator('[data-library-folder="folder"]').click();
  await begin(); await over(page.locator('.breadcrumbs [data-library-folder="folder"]'));
  assert.equal(await page.locator('.library-drop-target').count(), 0);
  await page.mouse.up(); await clean(); assert.deepEqual(await ids(), ['visual-0']);
  console.log('PASS current folder has no misleading drop highlight');
  await page.waitForTimeout(650); await begin(); await over(page.locator('[data-library-folder=""]'));
  await page.evaluate(() => {
   window.oldStorageSet = Storage.prototype.setItem;
   let failed = false;
   Storage.prototype.setItem = function (k, v) { if (k === 'mundok-v3/library-order' && !failed) { failed = true; throw new Error('preview-save-failed'); } return window.oldStorageSet.call(this, k, v); };
  });
  await page.mouse.up(); await clean();
  assert.deepEqual(await ids(), ['visual-0']); assert.match(await page.locator('.library-status').innerText(), /preview-save-failed/);
  await page.evaluate(() => { Storage.prototype.setItem = window.oldStorageSet; });
  console.log('PASS failed save returns cover without reporting success');
  await page.waitForTimeout(650); await page.emulateMedia({ reducedMotion: 'reduce' });
  await begin(); await page.keyboard.press('Escape'); await page.mouse.up(); await clean();
  assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0);
  console.log('PASS reduced motion and no leftover animation');
  await page.waitForTimeout(650); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await begin(); await over(page.locator('.breadcrumbs [data-library-folder="folder"]'));
  await page.mouse.up(); await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  assert.equal(await page.locator('.breadcrumbs [aria-current]').innerText(), '라이브러리');
  assert.equal(await page.locator('.library-drag-preview').count(), 0);
  console.log('PASS navigating during settlement removes the old ghost');
  assert.deepEqual(errors, []);
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
