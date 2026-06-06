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

export interface Level {
  key: string;
  label: string;
  cards: Card[];
}

export interface Doc {
  id: string;
  title: string;
  sub: string;
  levels: Level[];
}
