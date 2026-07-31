import type { NewDocInput, Store } from './types';
import type { UserAddition, UserEdit, UserDeletion, GrammarAnnotation, InterpChunk } from '../types';
import {
  createUserDoc,
  userAddCard, userEditCard, userDeleteCard, userSaveGrammar, userSaveInterp,
} from '../user-docs';

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
}
