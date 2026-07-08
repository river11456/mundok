import type { UserData, UserAddition, UserEdit, UserDeletion, GrammarAnnotation } from '../types';

/**
 * 저장 계층 추상화 — 앱 본체는 이 인터페이스로만 영속화를 호출한다.
 *
 * 구현체:
 *   - ServerStore : 관리자 저작용. server.py(파일 userdata.json)에 기록.
 *   - LocalStore  : 정적 배포용. 브라우저 localStorage에 기록.
 *   - (미래) BackendStore : 서버 API + 계정 동기화. 이 파일 하나만 추가하면 됨.
 *
 * 콘텐츠 흐름:
 *   CSV(베이스) → 빌드에 베이킹된 관리자 userdata.json → loadDelta()(사용자 로컬 편집분)
 */
export interface Store {
  /** 진단·메시지용 식별자 */
  readonly kind: 'server' | 'local';

  /**
   * 빌드에 베이킹된 관리자 콘텐츠 위에 덧입힐 "사용자 델타"를 반환.
   * - ServerStore : null (관리자 기록이 곧 베이킹 콘텐츠라 별도 델타 없음)
   * - LocalStore  : localStorage에 누적된 UserData
   */
  loadDelta(): Promise<UserData | null>;

  /** 반환값: 새로 부여된(또는 기존과 중복된) 카드 id */
  addCard(addition: UserAddition): Promise<string>;
  editCard(edit: UserEdit): Promise<void>;
  deleteCard(deletion: UserDeletion): Promise<void>;
  saveGrammar(docId: string, cardId: string, cardFront: string, annotations: GrammarAnnotation[]): Promise<void>;
}
