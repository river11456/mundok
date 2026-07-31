export type Screen = 'home' | 'level' | 'study';
export type Mode   = 'seq' | 'anki';
export type Side   = 'front' | 'back' | 'result';

export interface Card {
  id: string;
  front: string;
  reading: string;
  back: string;
  note: string;
  fail_count: number;
  interp?: InterpChunk[];   // 해석 순서 청크 (sentence 전용) — 배열 순서 = 해석 순서
}

export type LevelKey = 'char' | 'word' | 'sentence' | 'paragraph';

export const LEVEL_ORDER: readonly LevelKey[] = ['char', 'word', 'sentence', 'paragraph'];
export const LEVEL_LABEL: Record<LevelKey, string> = {
  char:      '개별 글자',
  word:      '단어 단위',
  sentence:  '문장 단위',
  paragraph: '단락 단위',
};

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
  order?: number;   // 정렬 우선순위 (카탈로그 order 승계) — 미분류 선반 정렬에 사용
  userDoc?: boolean; // 직접 생성 문헌 (source 없음) — 홈 '내 문헌' 선반 배치 기준
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
  interp?: InterpEntry[];
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

/** 해석 순서 청크 — text 코드포인트 인덱스 [start, end). 담는 배열의 순서가 해석 순서. */
export interface InterpChunk {
  start: number;
  end: number;
}

/** LocalStore 델타용 — grammar 와 같은 (docId, cardFront) 키 방식. */
export interface InterpEntry {
  docId: string;
  cardFront: string;
  chunks: InterpChunk[];
}

// ── Progress·Preference (SPEC 2.4, 4.2) ─────────────────────────────────

/**
 * 학습 이벤트 — 문헌별 append-only 리뷰 로그 (mundok-v3/log/<docId>).
 * 파생값(오답 수·최근 학습)은 review-log.ts가 계산한다. SRS 도입 시에도 과거가 남는다.
 */
export type ReviewEvent =
  | { t: 'anki';   card: string; lv: LevelKey; ts: number; grade: 1 | 2 | 3 }
  | { t: 'seq';    card: string; lv: LevelKey; ts: number }                    // 순차 첫 플립
  | { t: 'legacy'; card: string; lv: LevelKey; ts: number; fails: number }     // v1 fail_count 승계 (card '' = 시각만)
  | { t: 'reset';  lv: LevelKey; ts: number };                                 // 안키 기록 초기화 (Ctrl+Shift+R)

export interface LastSession {
  docId: string;
  lvKey: LevelKey;
  mode:  Mode;
  idx:   number;   // seq: 현재 카드 인덱스 / anki: 완료 장수 (표시용)
  total: number;
  ts:    number;
}

export interface StreakData { lastDate: string; count: number; todayCards: number; }

export interface SessionData {
  last:   LastSession | null;
  streak: StreakData;
}

export interface PrefsData {
  shelvesCollapsed: string[];
  onboardingSeen:   boolean;
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
  interp?:  InterpChunk[];        // 해석 순서 청크 (sentence 전용) — 배열 순서 = 해석 순서
  drill?:   string[];             // 명시적 드릴다운 대상 카드 id. 없으면 자동 substring 매칭.
  editedAt?: number;              // 유저 수정 시각(epoch ms) — 카탈로그 업데이트 머지가 이 카드를 보존 (SPEC C6)
  status?:  'draft';              // 사진 인제스트 초안 표시 (Phase 6 예약 — SPEC 2.3)
}

export interface DocJSON {
  id:     string;    // = 파일명 (기존 docId·localStorage 키 호환)
  schemaVersion?: number;  // 데이터 모델 버전 — v2 쓰기 경로가 3을 스탬프. 부재 = v1 산출물 (SPEC 2.3)
  title:  string;
  sub:    string;
  order?: number;    // 홈 화면 정렬 우선순위 (작을수록 앞). 없으면 파일명 가나다순 뒤에 배치.
  color?: string;    // 표지색 (#RRGGBB). 미지정 시 팔레트 순환 자동 배정.
  updatedAt?: string; // 마지막 수정 시각(ISO) — 사용자 문헌에서 사용, 미래 동기화 비교 키
  version?: number;   // 카탈로그 문헌의 개정 번호 (기본 1) — 올리면 설치자에게 업데이트 표시
  source?: {          // 카탈로그에서 받은 문헌의 출처 메타 — "어디서 왔나 + 업데이트 확인용" 꼬리표 (SPEC 공리 3)
    catalogId:   string;
    version:     number;
    installedAt?: string;   // 설치 시각(ISO)
    removed?:    string[];  // 유저가 삭제한 카탈로그 카드 id — 업데이트 머지가 재도입하지 않음 (C6)
  };
  origin?: { work?: string; author?: string; pages?: string };  // 원전 메타 (SPEC 2.3 — 승격 시 매니페스트에서 승계)
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
