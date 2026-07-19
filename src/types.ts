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
  color?: string;   // 표지색 (#RRGGBB). 미지정 시 팔레트 순환 자동 배정.
  userDoc?: boolean; // 사용자 생성 문헌 (localStorage user-docs) — 홈 '내 문헌' 선반·편집 UI 노출
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
  id: string;        // 서버 모드: 카드 탐색 키. LocalStore는 origText로 매칭(무시)
  origText: string;
  text: string;
  reading: string;
  meaning: string;
  note: string;
}

export interface UserDeletion {
  docId: string;
  type: LevelKey;
  id: string;        // 서버 모드: 카드 탐색 키. LocalStore는 text로 매칭(무시)
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

// ── 문헌별 JSON 콘텐츠 스키마 (CSV + userdata.json 통합본) ──────────────
//   src/data/<문헌>.json 의 형태. 안정적 카드 id를 1급 시민으로 갖는다.

export interface CardJSON {
  id:      string;   // 문헌 내 안정 id (c1/w1/s1/p1...). 텍스트와 무관하게 영구 불변.
  text:    string;   // 앞면 (= Card.front)
  reading: string;
  meaning: string;   // 뒷면 (= Card.back)
  note:    string;
  grammar?: GrammarAnnotation[];  // 카드 내장 문법 주석 (cardFront 키 불필요)
  drill?:   string[];             // 명시적 드릴다운 대상 카드 id. 없으면 자동 substring 매칭.
}

export interface DocJSON {
  id:     string;    // = 파일명 (기존 docId·localStorage 키 호환)
  title:  string;
  sub:    string;
  order?: number;    // 홈 화면 정렬 우선순위 (작을수록 앞). 없으면 파일명 가나다순 뒤에 배치.
  color?: string;    // 표지색 (#RRGGBB). 미지정 시 팔레트 순환 자동 배정.
  updatedAt?: string; // 마지막 수정 시각(ISO) — 사용자 문헌에서 사용, 미래 동기화 비교 키
  version?: number;   // 카탈로그 문헌의 개정 번호 (기본 1) — 올리면 설치자에게 업데이트 표시
  source?: { catalogId: string; version: number };  // 카탈로그에서 받은 문헌의 출처 메타
  levels: Partial<Record<LevelKey, CardJSON[]>>;
}

// ── 서가 그룹 스키마 (src/data/_groups.json — 문헌 JSON과 별도 파일) ────────
//   선반(shelves) = 홈 화면 그룹, refs = 참고문헌(부모-자식, 겹침 무더기+오버레이).

export interface ShelfJSON {
  id:     string;    // 안정 id (g1, g2, …)
  name:   string;    // 선반 표시 이름
  docIds: string[];  // 소속 문헌 (표시 순서)
}

export interface RefGroupJSON {
  parentId: string;
  childIds: string[];
}

export interface GroupsJSON {
  shelves: ShelfJSON[];
  refs:    RefGroupJSON[];
}
