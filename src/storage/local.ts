import type { NewDocInput, Store } from './types';
import type { UserData, UserAddition, UserEdit, UserDeletion, GrammarAnnotation } from '../types';
import {
  createUserDoc, isUserDoc,
  userAddCard, userEditCard, userDeleteCard, userSaveGrammar,
} from '../user-docs';

/** localStorage에 저장되는 사용자 편집 델타의 키 */
export const LOCAL_KEY = 'hanja-v2/userdata';

function empty(): UserData {
  return { additions: [], edits: [], deletions: [], grammar: [] };
}

function load(): UserData {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return empty();
    const d = JSON.parse(raw) as Partial<UserData>;
    return {
      additions: d.additions ?? [],
      edits:     d.edits ?? [],
      deletions: d.deletions ?? [],
      grammar:   d.grammar ?? [],
    };
  } catch {
    return empty();
  }
}

function save(d: UserData): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
}

/**
 * 정적 배포용 저장소. 사용자 편집을 브라우저 localStorage에 누적한다.
 * server.py의 CRUD 병합 로직(_add_card/_edit_card/_delete_card)과 동일한 규칙.
 * 사용자 생성 문헌(user-docs)은 델타가 아니라 문헌 객체를 id 기반으로 직접 수정한다.
 */
export class LocalStore implements Store {
  readonly kind = 'local' as const;

  async loadDelta(): Promise<UserData | null> {
    return load();
  }

  async createDoc(input: NewDocInput): Promise<string> {
    return createUserDoc(
      { title: input.title, sub: input.sub, color: input.color },
      input.type, input.texts,
    ).id;
  }

  async addCard(a: UserAddition): Promise<string> {
    if (isUserDoc(a.docId)) {
      return userAddCard(a.docId, a.type, { text: a.text, reading: a.reading, meaning: a.meaning, note: a.note });
    }
    const d = load();
    d.additions.push(a);
    save(d);
    return `${a.docId}_${a.type}_${a.text}`;
  }

  async editCard(e: UserEdit): Promise<void> {
    if (isUserDoc(e.docId)) {
      userEditCard(e.docId, e.type, e.id, { text: e.text, reading: e.reading, meaning: e.meaning, note: e.note });
      return;
    }
    const d = load();
    // 사용자가 추가한 카드면 그 add를 직접 갱신, 아니면 edits에 기록(중복 제거)
    const add = d.additions.find(x => x.docId === e.docId && x.type === e.type && x.text === e.origText);
    if (add) {
      add.text = e.text; add.reading = e.reading; add.meaning = e.meaning; add.note = e.note;
    } else {
      d.edits = d.edits.filter(x => !(x.docId === e.docId && x.type === e.type && x.origText === e.origText));
      d.edits.push(e);
    }
    save(d);
  }

  async deleteCard(del: UserDeletion): Promise<void> {
    if (isUserDoc(del.docId)) {
      userDeleteCard(del.docId, del.type, del.id);
      return;
    }
    const d = load();
    const before = d.additions.length;
    d.additions = d.additions.filter(a => !(a.docId === del.docId && a.type === del.type && a.text === del.text));
    if (d.additions.length === before) {
      // 베이킹된 카드 삭제 → deletions에 기록(중복 제거)
      d.deletions = d.deletions.filter(x => !(x.docId === del.docId && x.type === del.type && x.text === del.text));
      d.deletions.push(del);
    }
    save(d);
  }

  async saveGrammar(docId: string, cardId: string, cardFront: string, annotations: GrammarAnnotation[]): Promise<void> {
    if (isUserDoc(docId)) {
      userSaveGrammar(docId, cardId, annotations);
      return;
    }
    const d = load();
    d.grammar = (d.grammar ?? []).filter(g => !(g.docId === docId && g.cardFront === cardFront));
    if (annotations.length > 0) d.grammar!.push({ docId, cardFront, annotations });
    save(d);
  }
}
