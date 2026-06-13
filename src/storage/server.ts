import type { Store } from './types';
import type { UserData, UserAddition, UserEdit, UserDeletion, GrammarAnnotation } from '../types';

/** server.py의 CRUD API로 POST. 실패 시 throw. */
async function post(path: string, body: unknown): Promise<void> {
  (window as any).__hanjaSkipReloads = ((window as any).__hanjaSkipReloads || 0) + 1;
  const res  = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? '저장 실패');
}

/**
 * 관리자 저작용 저장소.
 * server.py가 userdata.json 파일에 기록하고, vite build --watch가 재빌드 →
 * 다음 로드 시 베이킹 콘텐츠에 반영된다. 따라서 loadDelta()는 null.
 */
export class ServerStore implements Store {
  readonly kind = 'server' as const;

  async loadDelta(): Promise<UserData | null> {
    return null;
  }

  async addCard(a: UserAddition): Promise<void> {
    // server.py 계약: front/back 필드명 사용
    await post('/api/add-card', {
      docId: a.docId, type: a.type, front: a.text,
      reading: a.reading, back: a.meaning, note: a.note,
    });
  }

  async editCard(e: UserEdit): Promise<void> {
    await post('/api/edit-card', {
      docId: e.docId, type: e.type, origFront: e.origText, text: e.text,
      reading: e.reading, back: e.meaning, note: e.note,
    });
  }

  async deleteCard(d: UserDeletion): Promise<void> {
    await post('/api/delete-card', { docId: d.docId, type: d.type, front: d.text });
  }

  async saveGrammar(docId: string, cardFront: string, annotations: GrammarAnnotation[]): Promise<void> {
    await post('/api/save-grammar', { docId, cardFront, annotations });
  }
}
