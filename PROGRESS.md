# 文讀 — 진행 상황 요약

> 새 세션에서 이어받을 때 이 파일을 먼저 읽으세요.

---

## 프로젝트 개요

고전 한문 학습 웹앱. **Vite + TypeScript**, CSV 기반 카드 데이터.  
`src/data/*.csv` 파일 하나 추가 → `npm run build` → 앱에 자동 반영.

**앱 이름**: 文讀  
**실행**: `한문공부.command` 더블클릭 → `http://localhost:19234`  
**빌드**: `npm run build` (약 1초)

---

## 파일 구조

```
한문문헌공부/
├── src/
│   ├── main.ts          # 진입점 — initAddCard, setupClick, setupKeyboard, render
│   ├── types.ts         # Card, Level, Doc, Screen, Mode, Side 타입
│   ├── state.ts         # 전역 상태 S, DRILL_NEXT, pushNav/popNav, shuffle 등
│   ├── docs.ts          # import.meta.glob으로 CSV 자동 로드 → DOCS 배열
│   ├── csv.ts           # parseCSV (BOM 제거, quote 처리)
│   ├── render.ts        # 전체 화면 렌더링, tokenizeHighlights, drillSection
│   ├── events.ts        # 클릭 위임, 키보드 단축키
│   ├── anki.ts          # rate(1|2|3) — 안키 큐 알고리즘
│   ├── addcard.ts       # 카드 추가 모달 + 드래그 선택 버블 + POST /api/add-card
│   └── data/
│       ├── 불치이병치미병.csv   # 현재 유일한 문헌 데이터
│       └── original/           # 원본 PDF들 (참고용)
├── index.html           # Tailwind CDN, Nanum Myeongjo 폰트, #app div
├── vite.config.ts       # base: './', crossorigin 제거 플러그인
├── server.py            # 커스텀 HTTP 서버 (정적 파일 + POST /api/add-card)
├── 한문공부.command      # 포트 정리 → 브라우저 열기 → server.py 실행
└── 요구사양서.md         # 초기 기획서
```

---

## CSV 형식

```
type,front,back,note
meta,문헌제목,부제,
word,攝養,섭양 — 섭생하고 양생함,설명
sentence,是故로 已病而後治는...,해석,문법 설명
paragraph,與其救療於...,전체 해석,단락 설명
```

- `type` 값: `meta` | `char` | `word` | `sentence` | `paragraph`
- `char` 타입은 아직 데이터 없음 (나중에 직접 추가 예정)
- 쉼표·따옴표 포함 필드만 `"..."` 처리, 나머지 naked (통일 완료)
- 새 문헌 추가: CSV 파일 하나를 `src/data/`에 넣고 `npm run build`

---

## 현재 문헌 데이터 (불치이병치미병.csv)

- **meta** 1행
- **word** 18개
- **sentence** 32개
- **paragraph** 7개
- **char** 0개 (미입력)

---

## 구현된 기능

### 화면 흐름
`home` → `mode` → `level` → `study`

- **home**: 문헌 목록
- **mode**: 순차 재생 / 안키 모드 선택
- **level**: 개별 글자 / 단어 단위 / 문장 단위 / 단락 단위 선택
- **study**: 카드 학습

### 학습 모드
| 모드 | 동작 |
|------|------|
| 순차 재생 | Space(뒤집기), ←/→(이동), Enter(다음) |
| 안키 모드 | Space(뒤집기), 1/2/3(난이도), 어려움=1~3칸 뒤, 보통=중간, 쉬움=제거 |

### 안키 알고리즘
- `1(어려움)` → 큐 1~3번째 사이 임의 삽입
- `2(보통)` → 큐 중간 삽입
- `3(쉬움)` → 큐에서 제거 (완료), fail_count 안 올림
- `fail_count` localStorage에 저장, 결과 화면에서 오답 랭킹 표시
- `Ctrl+Shift+R` → localStorage 초기화 후 재시작

### 드릴다운 내비게이션
- 카드 텍스트 내 하위 레벨 카드와 매칭되는 부분이 **밑줄 + 호버 강조**로 표시
- 클릭 → 해당 하위 카드로 바로 이동 (navStack에 현재 위치 저장)
- 뒤로가기(←버튼 or Escape) → navStack에서 pop해서 원래 카드로 복귀
- 드릴다운 경로: `paragraph → sentence → word → char`
- 하위 레벨 카드 없으면 드릴섹션에 "CSV에 추가하면 이동 가능" 안내

### 카드 추가 (웹앱 → CSV 역반영)
- 카드 텍스트 **드래그 선택** → "＋ 카드 추가" 버블 뜸
- 클릭 → 모달 (타입 자동 선택, 앞면 자동 입력)
- 저장 → `POST /api/add-card` → `server.py`가 CSV에 행 추가 → `npm run build` 자동 실행 → 페이지 리로드
- 서버 미실행 시 에러 메시지 표시

### 디자인
- 배경: `#F7F5F0` (따뜻한 종이색)
- 폰트: Nanum Myeongjo
- 컬러: stone 계열 모노톤
- 카드 스타일 레벨별 자동 조정:
  - `char`: text-6xl, 중앙 정렬
  - `word`: text-4xl, 중앙 정렬
  - `sentence`: text-xl, 좌측 정렬
  - `paragraph`: text-base, 좌측 정렬, max-w-3xl

---

## 서버 구조 (server.py)

`python -m http.server` 대신 커스텀 서버 사용.

- `GET *` → `dist/` 정적 파일 서빙
- `POST /api/add-card` → CSV 행 추가 → `npm run build` 실행
  - body: `{ docId, type, front, back, note }`
  - response: `{ ok: boolean, error?: string }`

---

## 키보드 단축키 전체

| 화면 | 키 | 동작 |
|------|-----|------|
| home | `1`~`9` | 해당 번호 문헌 선택 |
| mode | `1` | 순차 재생 / `2` 안키 모드 |
| level | `1`~`N` | 해당 레벨 시작 |
| study(seq) | `Space` | 뒤집기 |
| study(seq) | `→` / `Enter` | 다음 / `←` 이전 |
| study(anki) | `Space` | 뒤집기 |
| study(anki) | `1` / `2` / `3` | 난이도 |
| study(anki) | `r` / `R` | 다시 시작 (결과 화면) |
| 전체 | `Escape` | 뒤로가기 |
| study(anki) | `Ctrl+Shift+R` | localStorage 초기화 |

---

## 남은 작업 / 가능한 개선

- [ ] `char` 타입 데이터 추가 (직접 입력 예정)
- [ ] 다른 문헌 CSV 추가 (`src/data/original/`에 PDF 있음)
  - `대의정성.pdf`
  - `식무구포.pdf`
  - `양성편.pdf`
- [ ] 안키 모드에도 드릴다운 지원 (현재 순차 재생만)
- [ ] 카드 편집/삭제 기능 (현재 추가만 가능)

---

## 새 문헌 추가하는 법

1. `src/data/원본이름.csv` 생성
2. 첫 행: `type,front,back,note`
3. 두 번째 행: `meta,문헌제목,부제,`
4. 이후 `word` / `sentence` / `paragraph` 행 추가
5. `npm run build`

---

## 미래 계획: 멀티유저 배포 (~10명)

### 목표
동기 10명이 각자 자신만의 카드 데이터와 학습 진도를 가지고 현재 기능(추가/수정/삭제/안키) 풀로 사용.

### 현재 구조의 한계
- CSV → 빌드 시 번들링 방식이라 유저별 데이터 분리 불가
- localStorage 진도 → 브라우저/기기 종속
- server.py는 로컬 전용 (파일시스템 직접 접근)

### 필요한 변경

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 카드 데이터 | CSV → 빌드 번들 | SQLite DB → 런타임 API |
| 유저 구분 | 없음 | username + 간단한 로그인 |
| 학습 진도 | localStorage | 서버 DB 저장 |
| 서버 | server.py (로컬) | Python + SQLite, 클라우드 배포 |

### 아키텍처
```
브라우저 → Python 서버 (Railway 또는 Render 무료 티어)
                │
           SQLite DB
           (users, cards, progress 테이블)
```

### 주요 작업 목록
- [ ] `server.py` 재작성: SQLite 연동 + 로그인 API (`/api/login`, `/api/me`)
- [ ] 카드 API에 `user_id` 컬럼 추가, 유저별 데이터 격리
- [ ] 프론트: `docs.ts`의 `import.meta.glob` → 런타임 `GET /api/docs` 호출로 교체
- [ ] 프론트: 로그인 화면 추가 (username + password, JWT 또는 세션 토큰)
- [ ] 학습 진도(안키 fail_count 등) localStorage → `POST /api/progress` 저장
- [ ] 기존 CSV 데이터 SQLite 마이그레이션 스크립트
- [ ] Railway 배포 설정 (Procfile 또는 railway.toml)

### 예상 작업량
2~3일. 로컬 버전은 현행 유지, 배포 버전을 별도 브랜치(`deploy`)로 분리 개발 권장.
