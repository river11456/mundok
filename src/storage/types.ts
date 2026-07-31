import type { UserAddition, UserEdit, UserDeletion, GrammarAnnotation, InterpChunk, LevelKey } from '../types';

/** 문헌 추가 마법사 입력 — texts가 비면 빈 문헌 */
export interface NewDocInput {
  title:  string;
  sub:    string;
  color?: string;
  type:   LevelKey;   // 초기 본문 카드 레벨 (sentence | paragraph)
  texts:  string[];
}

/**
 * 저장 계층 추상화 — 앱 본체는 이 인터페이스로만 영속화를 호출한다.
 *
 * 구현체:
 *   - LocalStore : 브라우저 localStorage(mundok-v3/). 유일한 구현.
 *   - (미래) BackendStore : 서버 API + 계정 동기화. 이 파일 하나만 추가하면 됨.
 *
 * v2: 모든 문헌이 유저 공간에서 동등하므로 편집은 카드 id 단일 경로다 (SPEC 3.2).
 * UserEdit.origText / UserDeletion.text 는 v1 델타 시절의 잔재 필드 — 무시된다.
 */
export interface Store {
  /** 진단·메시지용 식별자 */
  readonly kind: 'local';

  /** 새 문헌 생성. 반환값: 생성된 docId (`u-…`). */
  createDoc(input: NewDocInput): Promise<string>;

  /** 반환값: 새로 부여된(또는 기존과 중복된) 카드 id */
  addCard(addition: UserAddition): Promise<string>;
  editCard(edit: UserEdit): Promise<void>;
  deleteCard(deletion: UserDeletion): Promise<void>;
  saveGrammar(docId: string, cardId: string, cardFront: string, annotations: GrammarAnnotation[]): Promise<void>;
  /** 해석 순서 청크 저장 (sentence 전용). 빈 배열이면 제거. */
  saveInterp(docId: string, cardId: string, cardFront: string, chunks: InterpChunk[]): Promise<void>;
}
