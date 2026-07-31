import type { NewDocInput, Store } from './types';
import type {
  UserAddition, UserEdit, UserDeletion, GrammarAnnotation, InterpChunk,
  ReviewEvent, SessionData, PrefsData,
} from '../types';
import {
  createUserDoc,
  userAddCard, userEditCard, userDeleteCard, userSaveGrammar, userSaveInterp,
} from '../user-docs';
import { V3_SESSION_KEY, V3_PREFS_KEY, v3LogKey } from '../migrate-v1';
import { compact } from '../review-log';

/**
 * 유일한 Store 구현 — 유저 공간(mundok-v3/docs)의 문헌 객체를 카드 id로 직접 수정한다.
 * 출처(직접 생성/카탈로그 설치본) 구분 없는 단일 경로 (SPEC 공리 3).
 */
export class LocalStore implements Store {
  readonly kind = 'local' as const;

  async createDoc(input: NewDocInput): Promise<string> {
    return createUserDoc(
      { title: input.title, sub: input.sub, color: input.color },
      input.type, input.texts,
    ).id;
  }

  async addCard(a: UserAddition): Promise<string> {
    return userAddCard(a.docId, a.type, { text: a.text, reading: a.reading, meaning: a.meaning, note: a.note });
  }

  async editCard(e: UserEdit): Promise<void> {
    userEditCard(e.docId, e.type, e.id, { text: e.text, reading: e.reading, meaning: e.meaning, note: e.note });
  }

  async deleteCard(del: UserDeletion): Promise<void> {
    userDeleteCard(del.docId, del.type, del.id);
  }

  async saveGrammar(docId: string, cardId: string, _cardFront: string, annotations: GrammarAnnotation[]): Promise<void> {
    userSaveGrammar(docId, cardId, annotations);
  }

  async saveInterp(docId: string, cardId: string, _cardFront: string, chunks: InterpChunk[]): Promise<void> {
    userSaveInterp(docId, cardId, chunks);
  }

  // ── Progress ─────────────────────────────────────────────────────────────

  loadLog(docId: string): ReviewEvent[] {
    try {
      const arr = JSON.parse(localStorage.getItem(v3LogKey(docId)) ?? '[]') as unknown;
      return Array.isArray(arr) ? arr as ReviewEvent[] : [];
    } catch {
      return [];
    }
  }

  appendLog(docId: string, events: ReviewEvent[]): void {
    const log = compact([...this.loadLog(docId), ...events]);
    localStorage.setItem(v3LogKey(docId), JSON.stringify(log));
  }

  deleteLog(docId: string): void {
    localStorage.removeItem(v3LogKey(docId));
  }

  loadSession(): SessionData {
    try {
      const s = JSON.parse(localStorage.getItem(V3_SESSION_KEY) ?? 'null') as SessionData | null;
      if (s && typeof s === 'object' && 'streak' in s) return { last: s.last ?? null, streak: s.streak };
    } catch { /* ignore */ }
    return { last: null, streak: { lastDate: '', count: 0, todayCards: 0 } };
  }

  saveSession(s: SessionData): void {
    localStorage.setItem(V3_SESSION_KEY, JSON.stringify(s));
  }

  // ── Preference ───────────────────────────────────────────────────────────

  loadPrefs(): PrefsData {
    try {
      const p = JSON.parse(localStorage.getItem(V3_PREFS_KEY) ?? 'null') as PrefsData | null;
      if (p && typeof p === 'object') {
        return {
          shelvesCollapsed: Array.isArray(p.shelvesCollapsed) ? p.shelvesCollapsed : [],
          onboardingSeen:   p.onboardingSeen === true,
        };
      }
    } catch { /* ignore */ }
    return { shelvesCollapsed: [], onboardingSeen: false };
  }

  savePrefs(p: PrefsData): void {
    localStorage.setItem(V3_PREFS_KEY, JSON.stringify(p));
  }
}
