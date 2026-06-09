export type Screen = 'home' | 'mode' | 'level' | 'study';
export type Mode   = 'seq' | 'anki';
export type Side   = 'front' | 'back' | 'result';

export interface Card {
  id: string;
  front: string;
  reading: string;
  back: string;
  note: string;
  fail_count: number;
}

export type LevelKey = 'char' | 'word' | 'sentence' | 'paragraph';

export interface Level {
  key: LevelKey;
  label: string;
  cards: Card[];
}

export interface Doc {
  id: string;
  title: string;
  sub: string;
  levels: Level[];
}

export interface UserAddition {
  docId: string;
  type: LevelKey;
  text: string;
  reading: string;
  meaning: string;
  note: string;
}

export interface UserEdit {
  docId: string;
  type: LevelKey;
  origText: string;
  text: string;
  reading: string;
  meaning: string;
  note: string;
}

export interface UserDeletion {
  docId: string;
  type: LevelKey;
  text: string;
}

export interface UserData {
  additions: UserAddition[];
  edits: UserEdit[];
  deletions: UserDeletion[];
  grammar?: GrammarEntry[];
}

export type GrammarType = 'S' | 'V' | 'O' | 'phrase';

export interface GrammarAnnotation {
  type: GrammarType;
  start: number;  // front 문자열 내 시작 인덱스 (포함)
  end: number;    // 끝 인덱스 (미포함)
}

export interface GrammarEntry {
  docId: string;
  cardFront: string;
  annotations: GrammarAnnotation[];
}
