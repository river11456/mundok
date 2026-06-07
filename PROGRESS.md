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
│   └── data/
│       ├── 불치이병치미병.csv
│       ├── 대의정성.csv
│       ├── 식무구포.csv
│       ├── 양성편.csv
│       └── original/   # 원본 PDF (참고용)
├── dist/              # 빌드 산출물 (git 포함 — 일반 사용자 빌드 불필요)
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

## 배포 구조

| 대상 | 필요한 것 | 방법 |
|------|----------|------|
| 관리자 (본인) | Node.js + npm | `npm run build` 후 dist/ 커밋 |
| 일반 사용자 | Python3 (macOS 기본 설치) | `git clone` → `문독.command` 더블클릭 |

`server.py`는 `npm`이 없으면 빌드를 건너뛰고 기존 `dist/`를 그대로 사용.

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

> ⚠️ 현재 카드 CRUD는 `src/data/*.csv`에 직접 쓰므로 빌드가 필요함.  
> **다음 작업**: `dist/userdata.json` 방식으로 전환 (빌드 없이 즉시 반영)

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

## 다음 작업: userdata.json 아키텍처

카드 CRUD를 `src/data/*.csv` 직접 쓰기 → `dist/userdata.json` 방식으로 전환.

### 목표
- 일반 사용자도 카드 추가/수정/삭제 가능 (빌드 불필요)
- 관리자만 새 문헌 추가 시 빌드 필요

### 데이터 레이어
| | 기본 문헌 데이터 | 사용자 카드 변경 |
|---|---|---|
| 저장 위치 | `src/data/*.csv` (빌드 번들) | `dist/userdata.json` (런타임) |
| 수정 주체 | 관리자 (빌드 필요) | 누구나 (빌드 불필요) |

### userdata.json 구조
```json
{
  "additions": [{ "docId": "식무구포", "type": "char", "text": "順", ... }],
  "edits":     [{ "docId": "식무구포", "type": "char", "origText": "順", ... }],
  "deletions": [{ "docId": "식무구포", "type": "char", "text": "順" }]
}
```

### 수정 파일
- `server.py`: CRUD API → `dist/userdata.json` 읽기/쓰기
- `docs.ts`: 번들 CSV 로드 후 `userdata.json` fetch → 병합
- `state.ts` 또는 `main.ts`: 초기화 비동기 처리
