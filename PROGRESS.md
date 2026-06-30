# 文讀 — 프로젝트 현황

> 새 세션에서 이어받을 때 이 파일을 먼저 읽으세요.

---

## 프로젝트 개요

한의학 한문 학습 웹앱. **Vite + TypeScript + Tailwind CSS (CDN)**.  
CSV 파일을 `src/data/`에 추가하면 빌드 시 자동 번들링.

**앱 이름**: 文讀  
**실행**: `문독.command` 더블클릭 → `http://localhost:19234`  
**빌드**: `npm run build` (약 1초)  
**서버**: `server.py` — 정적 파일 서빙 + 카드 CRUD API + 라이브 리로드

---

## 파일 구조

```
문독/
├── src/
│   ├── main.ts        # 진입점
│   ├── types.ts       # Card, Level, LevelKey, Doc, Screen, Mode, Side 타입
│   ├── state.ts       # 전역 상태 S, DRILL_LEVELS, pushNav/popNav 등
│   ├── docs.ts        # import.meta.glob으로 CSV 자동 로드 → DOCS 배열
│   ├── csv.ts         # papaparse 래퍼
│   ├── render.ts      # 전체 화면 렌더링, tokenizeHighlights, annotatedFront
│   ├── events.ts      # 클릭 위임, 키보드 단축키
│   ├── anki.ts        # rate(1|2|3) — 안키 큐 알고리즘
│   ├── addcard.ts     # 카드 추가 모달 + 드래그 버블 + 네이버 한자사전 검색
│   ├── editcard.ts    # 카드 수정 모달
│   ├── backup.ts      # 정적 모드 데이터 내보내기/가져오기 FAB
│   ├── storage/       # 저장 계층 추상화 (Store / LocalStore / ServerStore)
│   └── data/
│       ├── 불치이병치미병.csv
│       ├── 대의정성.csv
│       ├── 식무구포.csv
│       ├── 양성편.csv
│       ├── 여담론.csv       # 格致餘論 朱震亨
│       ├── 상고천진론.csv   # 황제내경 소문
│       ├── 편작육불치.csv
│       ├── 사기조신대론.csv # 황제내경 소문
│       └── original/   # 원본 PDF (참고용)
├── dist/              # 빌드 산출물 (git 제외 — CI가 빌드)
├── .github/workflows/ # deploy.yml — GitHub Pages 자동 배포
├── public/            # favicon.ico, icon.svg
├── index.html         # Tailwind CDN, 폰트, 애니메이션 CSS
├── vite.config.ts
├── server.py          # 커스텀 HTTP 서버 (npm 없으면 dist/ 그대로 사용)
├── 문독.command       # 포트 정리 → server.py 실행 → 브라우저 열기
└── PROGRESS.md
```

---

## CSV 형식

```
type,text,reading,meaning,note
meta,문헌제목,부제,,
char,治,치,다스리다,
word,攝養,섭양,섭생하고 양생함,
sentence,是故로 已病而後治는...,시고로 이병이후치는...,해석,문법 설명
paragraph,與其救療於...,여기구료어...,전체 해석,단락 설명
```

- **필드**: `type`, `text`, `reading`, `meaning`, `note` (5개)
- `type` 값: `meta` | `char` | `word` | `sentence` | `paragraph`
- `reading`: 한자와 글자 수가 같으면 뒷면에서 각 한자 아래 발음 표시
- 새 문헌 추가: CSV 파일을 `src/data/`에 넣고 `npm run build` → `dist/` 커밋

---

## 배포 구조 (정적 웹)

| 대상 | 필요한 것 | 방법 |
|------|----------|------|
| 일반 사용자 | (없음) | 브라우저로 `https://river11456.github.io/mundok/` 접속 |
| 관리자 (저작) | Git + Python3 + Node.js | 로컬에서 `server.py` 실행 → 편집 → `git push` |

- **호스팅**: GitHub Pages. `.github/workflows/deploy.yml` 이 `main` push마다 `npm ci && npm run build` 후 `dist/` 를 배포.
- **콘텐츠 베이킹**: `src/data/*.csv` + `userdata.json` 을 빌드 시 번들에 포함 → 서버 없이 표시.
- **dist/ 는 커밋하지 않음** (CI가 빌드). `userdata.json` 은 공유 콘텐츠 정본이라 **커밋함**.

### 저장 계층 추상화 (`src/storage/`)

모든 영속화는 `Store` 인터페이스 뒤로 모임. 흩어진 `fetch('/api/...')` 제거됨.

| 구현 | 환경 | 저장 위치 |
|------|------|----------|
| `LocalStore`  | 정적 배포 | 브라우저 `localStorage` (키 `hanja-v2/userdata`) |
| `ServerStore` | 관리자 저작 (server.py 감지) | 파일 `userdata.json` |
| *(미래)* `BackendStore` | 계정 동기화 | 서버 API — 이 파일 하나만 추가 |

- 환경 감지: 시작 시 `/api/version` 프로브 → 응답하면 `ServerStore`, 아니면 `LocalStore`.
- 콘텐츠 병합 순서(`docs.ts`): CSV → 베이킹된 `userdata.json` → 사용자 로컬 델타.
- **백업**: 정적 모드 좌하단 ⤓ FAB → 내보내기/가져오기 (`src/backup.ts`).

---

## 구현된 기능

### 화면 흐름
`home` → `mode` → `level` → `study`

### 학습 모드
| 모드 | 동작 |
|------|------|
| 순차 재생 | Space(뒤집기), ←/→/Enter(이동) |
| 안키 모드 | Space(뒤집기), 1/2/3(난이도) |

### 안키 알고리즘
- `1(어려움)` → 큐 1~3번째 사이 임의 삽입
- `2(보통)` → 큐 중간 삽입
- `3(쉬움)` → 큐에서 제거 (완료)
- `Ctrl+Shift+R` → localStorage 초기화 후 재시작

### 드릴다운 내비게이션
- 카드 텍스트 내 하위 레벨 카드 매칭 구간에 **밑줄** 표시
- 클릭 → 해당 하위 카드로 이동, 뒤로가기로 원래 카드 복귀
- 경로: `paragraph → sentence → [word, char]`, `sentence → [word, char]`, `word → char`
- `navStack`으로 위치 저장/복원

### 카드 뒤집기 — 한자 발음 표시
- `front.length === reading.length`인 경우 뒤집으면 각 한자 아래 발음 표시 (`<ruby>` 태그)
- 드릴다운 가능한 구간은 발음 아래 밑줄로 표시

### 카드 관리
- **추가**: 텍스트 드래그 → 버블 → 모달 → CSV 반영
  - 한자 입력칸 옆 **검색** 버튼 → 네이버 한자사전 새 탭
- **수정**: 카드 우상단 수정 버튼 → 모달 → CSV 반영
- **삭제**: 카드 우상단 삭제 버튼 → 확인 → CSV 반영

> 카드 CRUD는 `userdata.json`(프로젝트 루트)에 기록 — 빌드 없이 즉시 반영.

### 참고문헌 그룹핑 (홈 화면)
- `src/docs.ts`의 `DOC_GROUPS` 배열로 부모-자식 문헌 관계 선언
- 홈 화면에서 부모 카드 아래 "참고문헌 N" 토글 버튼으로 접기/펼치기
- 토글은 DOM 직접 조작 (전체 리렌더 없음)
- 새 그룹 추가: `DOC_GROUPS`에 `{ parentId, childIds }` 한 줄 추가

### 라이브 리로드 (관리자 모드)
- `vite build --watch`로 CSV 변경 감지 → 자동 빌드 → 브라우저 자동 갱신
- 카드 CRUD 후 불필요한 리로드 방지: `window.__hanjaSkipReloads` 카운터

### 디자인
- 배경: `#F7F5F0` (종이색), 안키 모드 시 `#EBF1F8` (파란 톤)
- 폰트: Noto Serif KR/SC (한자), Noto Sans KR (한글)
- 카드 스타일:
  - `char`: text-8xl, 중앙 정렬
  - `word`: text-5xl, 중앙 정렬
  - `sentence`: text-2xl, leading-[2.2], 좌측 정렬
  - `paragraph`: text-xl, leading-[2.2], 좌측 정렬

---

## 키보드 단축키

| 화면 | 키 | 동작 |
|------|----|------|
| home | `1`~`9` | 문헌 선택 |
| mode | `1` / `2` | 순차 / 안키 |
| level | `1`~`N` | 레벨 선택 |
| study(seq) | `Space` | 뒤집기 |
| study(seq) | `→` / `Enter` | 다음 |
| study(seq) | `←` | 이전 |
| study(anki) | `Space` | 뒤집기 |
| study(anki) | `1` / `2` / `3` | 난이도 |
| study(anki) | `r` / `R` | 재시작 (결과 화면) |
| 전체 | `Escape` | 뒤로가기 |
| study(anki) | `Ctrl+Shift+R` | localStorage 초기화 |

---

## 향후 작업

### 🔴 데이터 아키텍처 개선 — CSV → 문헌별 JSON 전환 (진행 중)

#### 결정 (2026-06-30)

데이터 포맷을 **CSV → 문헌별 JSON**으로 통합한다. CSV는 평면 표만 표현 가능해, 한자 학습 데이터의 실제 형태(트리·그래프: 카드 간 드릴다운 관계, 카드 내 문법주석 배열)를 담지 못한다. 그 결과 표현 불가한 것들이 전부 `userdata.json` + 코드 휴리스틱으로 새어나가 **진실이 분열**됐다.

**실측 근거** — 이미 201개 콘텐츠가 CSV 바깥(`userdata.json`)에 산다:

| 종류 | 수 | 의미 |
|------|----|----|
| additions | 149 | CSV에 아예 없는 카드 (식무구포 59·양성편 68 → 사실상 통째로 JSON에 있음) |
| edits | 18 | CSV를 덮어쓴 것 |
| deletions | 14 | CSV에 있지만 안 보이는 것 |
| grammar | 20 | CSV가 담지 못하는 문법 주석 |

#### 문제 진단 — "텍스트 = 식별자"

안정적 카드 ID가 없어 모든 연결이 한자 텍스트 문자열을 키(PK)로 쓴다.

| 연결 | 키 | 위치 | 증상 |
|------|----|----|----|
| 수정 | `origText` | `docs.ts:83` | 텍스트 수정 시 연결 끊김 |
| 삭제 | `text` | `docs.ts:74` | 중복 텍스트는 양쪽 적용 |
| 문법 | `cardFront`(문장 전체) | `grammar.ts:11` | 문장 한 글자 수정 → 주석 통째 소실 |
| 드릴다운 | `front.includes(card.front)` | `render.ts:81` | 저장된 관계가 아닌 렌더링 시점의 추측 |
| 안키 | 카드 **개수** 일치 | `state.ts:54` | 카드 1장 추가/삭제 → 학습기록 리셋 |

#### 확정 스키마 (`src/data/<문헌>.json`)

```jsonc
{
  "id": "편작육불치",          // = 파일명 (기존 docId·localStorage 키 호환 위해 한글 유지)
  "title": "扁鵲六不治",
  "sub": "편작의 6가지...",
  "levels": {
    "char": [ { "id": "c1", "text": "驕", "reading": "교만할 교", "meaning": "", "note": "" } ],
    "sentence": [
      { "id": "s1", "text": "驕恣不論於理 一不治也", "reading": "...", "meaning": "...", "note": "",
        "grammar": [{ "type": "S", "start": 0, "end": 2 }],   // 카드 안으로 내장
        "drill":   [] }                                        // 명시 링크 (비면 자동매칭)
    ]
  }
}
```

- 카드 id: 문헌 내 `c1/w1/s1/p1` 순번, 한 번 부여하면 텍스트 무관 영구 불변.
- `DOC_GROUPS`(참고문헌 그룹)는 Phase 1에선 유지, 후속에 `parent` 필드로 흡수 검토.

#### 실행 단계 (작은 단위, 각 단계 독립 검증)

- [x] **Phase 1 — 무손실 변환** ✅ (2026-06-30)
  - `types.ts`에 `DocJSON`/`CardJSON` 스키마 추가 완료 (기존 타입 유지)
  - 변환 스크립트 `scripts/migrate-to-json.mjs` — PapaParse + applyUserData 재사용
  - **결과**: `src/data/*.json` 8개 생성. 카드 946장·문법 19건 **무손실 검증 통과**(왕복 동등성 100%)
  - CSV·userdata.json은 그대로 보존 (Phase 2에서 로더 교체 후 정리)
  - ⚠ **발견**: 여담론 문법 1건이 이미 고아(텍스트 `充→充足` 수정으로 cardFront 불일치) — 현재 앱에서도 표시 안 되는 죽은 데이터라 변환에서 제외. *이게 바로 "텍스트=식별자" 버그의 실제 사례.* → 복구는 아래 별도 항목
- [x] **Phase 2 — 로더 교체** ✅ (2026-06-30)
  - `docs.ts`가 `import.meta.glob('./data/*.json')`로 JSON 로드, 베이스 카드에 안정 id 부여
  - 베이킹 델타 계층(`bakedUserData` import) 제거, CSV import 제거, 카드 내장 grammar → `collectGrammar()`로 펼침
  - 사용자 localStorage 델타 적용 경로 유지 (id 전환은 Phase 4)
  - **검증**: `npm run build` 통과(타입 OK), 로더 출력 946장·19건 = Phase 1 canonical 일치, 카드 id 문헌 내 유니크, 홈 순서 보존
  - ⚠ **부수효과**: 서버 모드(관리자) 저작이 일시 무력화 — `docs.ts`가 `userdata.json`을 안 읽으므로 `server.py` 편집이 화면에 반영 안 됨. **Phase 3에서 복구.** 일반 사용자(정적)는 정상.
- [x] **Phase 3 — server.py JSON 직접 편집** (단일 진실) ✅ (2026-06-30)
  - `server.py`의 add/edit/delete/grammar API가 `src/data/<문헌>.json`을 직접 수정 (id 자동채번 `next_id`, grammar는 sentence 카드 내장)
  - 구 `userdata.json` 델타 계층 폐기, `/userdata.json` GET 핸들러 제거
  - **검증**: 실서버 통합 테스트 11/11 통과(add→c38 채번·edit·save-grammar·delete→복귀), JSON 출력 포맷 원본과 100% 일치(diff 깔끔), 원본 자동 복원
  - 서버 모드 저작 복구 + *"편집 = JSON = 화면 = git diff"* 일치 달성
  - ✨ **부수 개선**: 카드 edit 시 grammar가 카드 내장이라 텍스트를 바꿔도 주석이 끊기지 않음 (여담론 같은 고아화 방지)
- [ ] **Phase 4 — 안키기록·로컬델타 id 기반** (구 ④) ← *지금 여기*
  - `state.ts` 안키 키를 카드 id별 `fail_count` 맵으로, `LocalStore` 델타도 id 참조
  - ⚠ 기존 사용자 localStorage(안키 기록·편집 델타) 마이그레이션 호환 주의
- [ ] **Phase 5 — 드릴다운 명시 링크(구 ②) + 빌드 lint(구 ⑤)**
  - `drill[]` 명시 링크 우선, 없으면 자동매칭. 중복 텍스트·깨진 링크·문법 인덱스 범위 빌드 시 경고
- [ ] **고아 문법 복구(선택)** — 여담론 `"故로 以菜助其充은…"` 문법 주석 1건. 새 텍스트(`充足`)에 맞춰 cardFront·인덱스 보정해 살릴지 결정. Phase 4(id 기반 전환) 이후엔 이런 고아화가 구조적으로 차단됨.
- [ ] **정리** — 구 `CSV`/`userdata.json`을 백업 후 제거

### 🟡 기타

- **포트 동적 탐색**: `문독.command`와 `server.py`의 포트가 `19234`로 하드코딩되어 있음. 다른 PC에서 해당 포트가 사용 중이면 기존 프로세스를 강제 종료하는 문제가 있음. `19234`를 우선 시도하되 사용 중이면 OS가 빈 포트를 자동 배정하도록 개선 필요.
