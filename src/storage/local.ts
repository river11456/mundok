import type { Store } from './types';
import type { UserData, UserAddition, UserEdit, UserDeletion, GrammarAnnotation } from '../types';

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
 */
export class LocalStore implements Store {
  readonly kind = 'local' as const;

  async loadDelta(): Promise<UserData | null> {
    return load();
  }

  async addCard(a: UserAddition): Promise<void> {
    const d = load();
    d.additions.push(a);
    save(d);
  }

  async editCard(e: UserEdit): Promise<void> {
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

  async saveGrammar(docId: string, cardFront: string, annotations: GrammarAnnotation[]): Promise<void> {
    const d = load();
    d.grammar = (d.grammar ?? []).filter(g => !(g.docId === docId && g.cardFront === cardFront));
    if (annotations.length > 0) d.grammar!.push({ docId, cardFront, annotations });
    save(d);
  }
}
