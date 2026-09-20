/** Backup preflight is pure: reject damaged values before any storage mutation. */
type ObjectValue = Record<string, unknown>;
const levels = ['char', 'word', 'sentence', 'paragraph'];
function check(ok: boolean, path: string): asserts ok {
  if (!ok) throw new Error(`백업 파일 형식이 올바르지 않습니다 (${path}).`);
}
function object(v: unknown, p: string): ObjectValue {
  check(typeof v === 'object' && v !== null && !Array.isArray(v), p);
  return v as ObjectValue;
}
function array(v: unknown, p: string): unknown[] { check(Array.isArray(v), p); return v; }
function string(v: unknown, p: string): void { check(typeof v === 'string', p); }
function id(v: unknown, p: string): void { check(typeof v === 'string' && v.length > 0, p); }
function number(v: unknown, p: string): void { check(typeof v === 'number' && Number.isFinite(v), p); }
function count(v: unknown, p: string): void { number(v, p); check(Number.isSafeInteger(v) && (v as number) >= 0, p); }
function strings(v: unknown, p: string): void { array(v, p).forEach(x => string(x, p)); }
function fields(v: ObjectValue, names: string[], p: string): void { names.forEach(k => string(v[k], `${p}.${k}`)); }
function optional(v: ObjectValue, k: string, p: string, validate: (v: unknown, p: string) => void): void {
  if (v[k] !== undefined) validate(v[k], `${p}.${k}`);
}
function level(v: unknown, p: string): void { check(typeof v === 'string' && levels.includes(v), p); }
function ranges(v: unknown, p: string, text: string, grammar = false): void {
  // Renderers index spread strings by Unicode code point. Reject stale ranges too:
  // trusting an unbounded end can turn their per-index loops into a frozen UI.
  const length = [...text].length;
  array(v, p).forEach(raw => {
    const a = object(raw, p);
    count(a.start, `${p}.start`); count(a.end, `${p}.end`);
    check((a.end as number) > (a.start as number) && (a.end as number) <= length, p);
    if (grammar) check(['S', 'V', 'O', 'phrase'].includes(a.type as string), `${p}.type`);
  });
}
function card(v: unknown, p: string): ObjectValue {
  const c = object(v, p);
  id(c.id, `${p}.id`); fields(c, ['text', 'reading', 'meaning', 'note'], p);
  if (c.grammar !== undefined) ranges(c.grammar, `${p}.grammar`, c.text as string, true);
  if (c.interp !== undefined) ranges(c.interp, `${p}.interp`, c.text as string);
  optional(c, 'drill', p, strings); optional(c, 'editedAt', p, number);
  if (c.status !== undefined) check(c.status === 'draft', `${p}.status`);
  return c;
}
function docs(v: unknown, p: string): void {
  const docIds = new Set();
  array(v, p).forEach(raw => {
    const d = object(raw, p);
    id(d.id, `${p}.id`); check(!docIds.has(d.id), `${p}: 중복 문헌 ID`); docIds.add(d.id);
    fields(d, ['title', 'sub'], p);
    for (const k of ['color', 'updatedAt']) optional(d, k, p, string);
    for (const k of ['order', 'schemaVersion', 'version']) optional(d, k, p, number);
    if (d.source !== undefined) {
      const s = object(d.source, `${p}.source`);
      id(s.catalogId, `${p}.source.catalogId`); number(s.version, `${p}.source.version`);
      optional(s, 'installedAt', p, string); optional(s, 'removed', p, strings);
    }
    if (d.origin !== undefined) {
      const o = object(d.origin, `${p}.origin`);
      for (const k of ['work', 'author', 'pages']) optional(o, k, p, string);
    }
    const cardIds = new Set();
    for (const [key, cards] of Object.entries(object(d.levels, `${p}.levels`))) {
      level(key, `${p}.levels`);
      array(cards, `${p}.levels.${key}`).forEach(rawCard => {
        const c = card(rawCard, `${p}.${String(d.id)}.${key}`);
        check(!cardIds.has(c.id), `${p}: 중복 카드 ID`); cardIds.add(c.id);
      });
    }
  });
}
function logs(v: unknown, p: string): void {
  array(v, p).forEach(raw => {
    const e = object(raw, p);
    level(e.lv, `${p}.lv`); number(e.ts, `${p}.ts`);
    check(['anki', 'seq', 'legacy', 'reset'].includes(e.t as string), `${p}.t`);
    if (e.t !== 'reset') string(e.card, `${p}.card`);
    if (e.t === 'anki') check([1, 2, 3].includes(e.grade as number), `${p}.grade`);
    if (e.t === 'legacy') count(e.fails, `${p}.fails`);
  });
}
function last(v: unknown, p: string): void {
  if (v === null) return;
  const s = object(v, p);
  id(s.docId, `${p}.docId`); level(s.lvKey, `${p}.lvKey`);
  check(s.mode === 'seq' || s.mode === 'anki', `${p}.mode`);
  count(s.idx, `${p}.idx`); count(s.total, `${p}.total`); number(s.ts, `${p}.ts`);
}
function streak(v: unknown, p: string): void {
  const s = object(v, p);
  string(s.lastDate, `${p}.lastDate`); count(s.count, `${p}.count`); count(s.todayCards, `${p}.todayCards`);
}
function session(v: unknown, p: string): void {
  if (v === null) return; // Older/current empty exports use null and restore defaults.
  const s = object(v, p); last(s.last, `${p}.last`); streak(s.streak, `${p}.streak`);
}
function prefs(v: unknown, p: string): void {
  const s = object(v, p);
  optional(s, 'shelvesCollapsed', p, strings);
  if (s.onboardingSeen !== undefined) check(typeof s.onboardingSeen === 'boolean', `${p}.onboardingSeen`);
}
function collections(v: unknown, p: string): void {
  // Structural damage is rejected; duplicate placement, cycles and missing parents
  // retain the existing normalizeShelves repair policy on import.
  array(v, p).forEach(raw => {
    const s = object(raw, p);
    id(s.id, `${p}.id`); string(s.name, `${p}.name`); strings(s.docIds, `${p}.docIds`);
    if (s.parentId !== undefined && s.parentId !== null) string(s.parentId, `${p}.parentId`);
    optional(s, 'color', p, string); optional(s, 'icon', p, string);
  });
}
function userdata(v: unknown, p: string): void {
  const u = object(v, p);
  for (const kind of ['additions', 'edits', 'deletions']) {
    array(u[kind], `${p}.${kind}`).forEach(raw => {
      const e = object(raw, `${p}.${kind}`);
      id(e.docId, `${p}.docId`); level(e.type, `${p}.type`); string(e.text, `${p}.text`);
      if (kind !== 'deletions') fields(e, ['reading', 'meaning', 'note'], p);
      if (kind === 'edits') string(e.origText, `${p}.origText`);
      // Historical deltas were text-addressed; id is not used by migration.
      optional(e, 'id', p, string);
    });
  }
  for (const kind of ['grammar', 'interp']) {
    if (u[kind] === undefined) continue;
    array(u[kind], `${p}.${kind}`).forEach(raw => {
      const e = object(raw, p); fields(e, ['docId', 'cardFront'], p);
      ranges(e[kind === 'grammar' ? 'annotations' : 'chunks'], `${p}.${kind}`, e.cardFront as string, kind === 'grammar');
    });
  }
}
function keyDump(v: unknown): void {
  for (const [key, raw] of Object.entries(object(v, 'keys'))) {
    check(key.startsWith('hanja-v2/') || key.startsWith('mundok-v3/'), key);
    string(raw, key);
    let value: unknown;
    try { value = JSON.parse(raw as string); } catch { throw new Error(`백업 내부 JSON을 읽을 수 없습니다 (${key}).`); }
    if (key === 'hanja-v2/userdata') userdata(value, key);
    else if (key === 'hanja-v2/user-docs' || key === 'mundok-v3/docs') docs(value, key);
    else if (key === 'mundok-v3/session') session(value, key);
    else if (key === 'mundok-v3/prefs') prefs(value, key);
    else if (key === 'mundok-v3/collections') collections(value, key);
    else if (key.startsWith('mundok-v3/log/')) { id(key.slice('mundok-v3/log/'.length), key); logs(value, key); }
    else if (key === 'hanja-v2/last-session') last(value, key);
    else if (key === 'hanja-v2/streak') streak(value, key);
    else if (key === 'hanja-v2/shelves-collapsed') strings(value, key);
    else if (key === 'hanja-v2/onboarding-seen') check(value === 0 || value === 1, key);
    else if (/^hanja-v2\/.+\/(char|word|sentence|paragraph)_ts$/.test(key)) number(value, key);
    else if (/^hanja-v2\/.+\/(char|word|sentence|paragraph)\/fails$/.test(key)) {
      Object.values(object(value, key)).forEach(n => count(n, key));
    } else if (/^hanja-v2\/.+\/(char|word|sentence|paragraph)$/.test(key)) {
      // Pre-fails-map Card[]: migration only needs front and fail_count.
      array(value, key).forEach(rawCard => {
        const c = object(rawCard, key); string(c.front, key); optional(c, 'fail_count', key, count);
        for (const k of ['id', 'reading', 'back', 'note']) optional(c, k, key, string);
        if (c.interp !== undefined) ranges(c.interp, key, c.front as string);
      });
    }
  }
}

export function validateBackup(value: unknown): void {
  const b = object(value, '백업');
  if (b.version === 3) {
    const c = object(b.content, 'content'); docs(c.docs, 'content.docs');
    optional(c, 'collections', 'content', collections);
    if (b.progress !== undefined) {
      const p = object(b.progress, 'progress');
      if (p.logs !== undefined) for (const [key, events] of Object.entries(object(p.logs, 'progress.logs'))) {
        id(key, 'progress.logs 문헌 ID'); logs(events, `progress.logs.${key}`);
      }
      optional(p, 'session', 'progress', session);
    }
    optional(b, 'preference', '백업', prefs);
  } else if (b.version === 2) keyDump(b.keys);
  else {
    check(b.version === undefined, '지원하지 않는 백업 버전');
    userdata(b, 'userdata');
  }
}
