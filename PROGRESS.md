# 文讀 — 프로젝트 현황

> 새 세션에서 이어받을 때 이 파일을 먼저 읽으세요.
> **개선 작업 목록은 `IMPROVEMENTS.md`** (2026-07-07 전수 검토) — 우선순위·착수 순서·항목별 위치/방법 정리됨.

---

## 프로젝트 개요

한의학 한문 학습 웹앱. **Vite + TypeScript + Tailwind CSS (빌드 타임, v4)**.  
문헌별 JSON 파일을 `src/data/`에 추가하면 빌드 시 자동 번들링.

**앱 이름**: 文讀  
**실행**: `문독.command` 더블클릭 → `http://localhost:19234`  
**빌드**: `npm run build` (약 1초)  
**서버**: `server.py` — 정적 파일 서빙 + 카드 CRUD API + 라이브 리로드

---

## 📌 현재 상태 (2026-07-19) — Phase 2 4단계 완료 (서가 홈 A1~A6, v1.5.0~v1.6.0)

`RENEWAL.md` 5절 4단계 구현 완료 — 커밋 `a386988`(서가 홈, v1.5.0) + `bc9e42d`(그룹 편집, v1.6.0):

- **스키마**: `src/data/_groups.json` 신설(shelves+refs, 하드코딩 `DOC_GROUPS` 흡수 — 미결 ① 구현), `DocJSON.color?` + 팔레트 8색 자동 배정, 로더·lint·서브셋 스크립트 `_*.json` 제외, lint에 그룹 참조·color 형식 ERROR (+테스트 3건 = 34건)
- **서가 홈**: 워드마크(해서)+streak 필(A5), 이어서 학습 히어로(A3 — `hanja-v2/last-session`, seq 인덱스 복원), 선반=그룹+접기(localStorage), 표지(제첨·키보드 배지 A6·장수·최근 칩, 파스텔 A2), 참고문헌 겹침 무더기 → **문헌 상세 오버레이**(A4 — 모드 시작은 mode 화면 생략하고 바로 level로, 참고문헌 숫자키 재부여, Esc/바깥 닫기)
- **그룹 편집(A1, 저작 모드)**: 홈 첫 선반 헤더 "그룹 편집" → 모달(이름·추가·삭제·↑↓ 순서·선반 간 이동). `server.py /api/save-groups`가 검증 후 원자적 기록 — 실서버 curl 3케이스 검증(정상·깨진 참조 거부·형식 오류 거부). refs는 보존
- ⚠ **서버 재시작 필요**: 그룹 편집 API는 새 server.py — `문독.command` 재실행 후 사용
- **다음**: 5단계 — C2 반응형(IMPROVEMENTS 🔴4 흡수)·C3 터치 대응 → 6단계 3해상도 전 화면 검증

---

## 📌 현재 상태 (2026-07-18 심야) — Phase 2 3단계 완료 (학습·결과·모달 리디자인, v1.4.0)

`RENEWAL.md` 5절 3단계 구현 완료·커밋(`df80642`):

- **학습 화면**: 본문 스케일 목업 이식(`.sentence-body` clamp 20~27px·행간 2.6 / `.paragraph-body` / char `.bigchar` 해서 clamp 84~124px), 드릴다운 `.drill`(액센트 호버), 문법 S/V/O 색 토큰화, 文法 토글 `.seg`, 카드 도구 `.icon-btn`, 안키 난이도 `.rate-btn` 3종, 카드 뒷면 `.card-back`/`.reading-line`/`.meaning`
- **mode·level**: 선택 카드 `.tile`(라운드 18px·스프링 호버) + 단축키 힌트 키캡화
- **결과 화면**: `.stat` 통계 타일 3종 + `.table-card` 오답표 + 키캡 푸터 (목업 화면 4 구조)
- **모달 5종**(추가·수정·연결카드·온보딩·단축키): `.modal-backdrop`(블러) + `.modal-surface`(라운드 24·pop), 버튼 `btn-primary`/`btn-ghost` 통일
- 검증: 빌드·테스트 31/31, 신규 클래스 17종 번들 확인. ⚠ 브라우저 육안 확인 필요(학습·결과·모달 전 화면)
- 남은 C1: 서가 홈(4단계). 백업 FAB 팝업·온보딩 내부 슬라이드 스타일은 잔여 stone 톤 — 4~5단계에서 마무리

**다음**: 4단계 — 서가 홈 (`_groups.json` 스키마 + A1~A6 + 문헌 상세 오버레이)

---

## 📌 현재 상태 (2026-07-18 밤) — Phase 2 2단계 완료 (토큰·공용 컴포넌트, v1.3.0)

- **SW 캐시 자동 무효화** (v1.2.1→v1.2.2): 서체 전환이 화면에 안 보이던 원인 = SW가 구 셸 캐싱 → 캐시 버전 인상으로 해결 후, `sw-cache-version` vite 플러그인으로 **빌드 시 package.json 버전 자동 주입** — 릴리스마다 셸 캐시 자동 무효화, 수동 인상 규칙 폐지 (폰트 캐시는 수동 유지)
- **2단계 (v1.3.0)**: `src/style.css`에 디자인 토큰 `:root`(색·그림자·스프링 이징·S/V/O) + 공용 컴포넌트 9종(`.btn-primary/.btn-ghost/.nav-btn/.btn-back/.icon-btn/.card-surface/.progress-track/.progress-fill/.kbd`) — 목업 `final.html`에서 이식. 앱 크롬 #F4F4F6 전환(index.html 첫 페인트 리터럴 + manifest 동기화). 순차·안키 학습 화면(진행바·카드 서피스·이전/다음·Space 키캡)·뒤로/홈 버튼·단축키 도움말에 적용
- 검증: 빌드·테스트 31/31, 번들 CSS 클래스 9종 생성 확인. 안키 난이도 버튼·모드/레벨/결과 화면은 3단계에서 리디자인
- **다음**: 3단계 — 학습 화면(순차·안키·결과)·모달 리디자인 (`RENEWAL.md` 5절)

---

## 📌 현재 상태 (2026-07-18 저녁) — Phase 2 1단계 완료 (서체·에셋 기반, v1.2.0)

`RENEWAL.md` 5절 1단계(B1~B3) 구현 완료·커밋(`03d966d`):

- **B1 폰트 스택 전환**: 명조(Noto Serif) 전면 제거 → 고딕 사슬(`Pretendard→Noto Sans KR→TC→SC`). 해서 `.kai` 클래스 신설 — 홈 워드마크·홈 카드 장식 대형 한자·char 카드 대형 한자 3곳만 적용(16px 미만·학습 본문 금지 준수). sw.js 폰트 캐시에 jsdelivr 추가(Pretendard 오프라인)
- **B2 WenKai 서브셋 self-host**: `npm run font:subset`(`scripts/subset-font.mjs`) — 콘텐츠 한자 610자만 서브셋 → `public/fonts/wenkai-tc-sub.woff2` **180KB**(원본 14.6MB). 원본 TTF는 `.fontcache/`(gitignore) 캐시, 산출물·글자 목록·OFL 라이선스는 커밋. 새 문헌 추가로 글자가 늘면 재실행
- **B3 커버리지 lint**: `lint-data.mjs`가 콘텐츠 한자 ⊄ 서브셋이면 WARN(재생성 안내). 단일 출처 `collectHanChars()`를 서브셋 스크립트와 공유
- **검증**: 빌드(lint ERROR 0·폰트 WARN 0 + tsc + vite) 통과, 테스트 31/31, dist/fonts 산출 확인. ⚠ 브라우저 육안 확인은 사용자 몫(서버 기동 후 홈·char 카드 서체 확인)

**다음**: 2단계 — 공용 컴포넌트·토큰 CSS (`design/tokens.md` 기준 버튼·카드·프로그레스·kbd)

---

## 📌 현재 상태 (2026-07-18) — 리뉴얼 미결 사항 처리

`RENEWAL.md` 4절 미결 5건 처리 (문서만 변경, v1.1.0 유지):

- **① 그룹 스키마** → 별도 **`src/data/_groups.json`** 확정 — 선반 그룹(`shelves`) + 참고문헌 관계(`refs`, 하드코딩 `DOC_GROUPS` 흡수)를 한 파일에 정의. 그룹 편집 UI·lint 참조 검사 용이, 복수 소속 표현 가능
- **④ WenKai 오프라인** → **사전 서브셋 + 커밋** 확정 — `subset-font` npm(devDep)으로 콘텐츠 한자+제목만 woff2 생성해 `public/fonts/`에 커밋, B3 커버리지 lint가 새 글자 감시. CI 변경 불필요
- **⑤ 버전** → 리뉴얼 완료 릴리스에 **2.0.0 부여** 확정 — `CLAUDE.md` 버전 규칙에 예외 명시 완료
- **②(vision API 키)·③(PPT 사진·써머리 PDF 샘플)**: 미확보 확인 — Phase 3 착수(8월 초) 전 준비, 미결로 잔존 (Phase 2 블로커 아님)

**다음 세션**: Phase 2 구현 착수 — `RENEWAL.md` 5절 1단계(B1~B3 서체·에셋 기반)부터. **블로커 없음.**

---

## 📌 현재 상태 (2026-07-17) — 2학기 리뉴얼 설계 완료

2학기 개강 전 대규모 기능 추가 + UI/UX 리뉴얼의 **설계 세션 완료** (코드 변경 없음 — 문서·목업만, v1.1.0 유지).

- **단계 계획**: `ROADMAP.md` — 사용자 인터뷰 기반 Phase 1~5 (개강 9월 초 역산, 8월 중순 기능 동결·실사용 베타). Phase 1(디자인) 완료 기록 포함
- **구현 요구사항 전체**: `RENEWAL.md` — 기능 17개(서가 홈·서체 엔지니어링·리디자인·사진 인제스트·쓰기 모드), 스키마 변경(전부 하위호환), 작업 순서, 미결 5건
- **디자인 확정**: GoodNotes 라이브러리 콘셉트 — 수치는 `design/tokens.md`, 시각 기준은 `design/mockups/final.html`(브라우저로 열면 서가 홈·문헌 상세 오버레이 인터랙션까지 확인 가능)
- **다음 세션**: Phase 2 구현 착수 — `RENEWAL.md` 5절 순서(① 서체·에셋 기반 B1~B3 → ② 공용 컴포넌트 → ③ 학습 화면 → ④ 서가 홈 → ⑤ 반응형). ⚠ 서가 홈(④) 착수 전 미결 ①(그룹 스키마 위치) 결정 필요

---

## 📌 현재 상태 (2026-07-08)

`IMPROVEMENTS.md` 🟡 중간 항목 5개(5·6·8·9·10) 완료·push 완료. 🔴 높음 4번(모바일 레이아웃)은 사용자 지시로 보류.
🟢 낮음 **원본 PDF 분리** 완료 — PDF 7개를 `~/Documents/문독-원본PDF/`로 이동(체크섬 검증), `git filter-repo`로 전체 히스토리에서 제거 후 force-push(전 커밋 해시 변경, 저장소 8.58MiB→433KiB). ⚠ 다른 기기에 기존 클론이 있다면 새로 clone 필요.

🟢 낮음 나머지 4건도 완료: ① server.py 미사용 `time` import 제거 ② 홈 화면 버전 문자열 `package.json` 주입 + 패키지명 `mundok` 정리 ③ 드릴다운/문법 인덱스 코드포인트 통일(`findDrillSpans` 코드포인트화, 벽자 회귀 테스트 추가, lint WARN 전후 동일) ④ `DocJSON.order` 필드로 홈 화면 순서 지정 지원(미설정 시 기존 파일명 순 유지). 🟢에서 남은 건 `문독.bat` Windows 검증(기기 필요)뿐 — **다음 세션 후보**: 보류 중인 🔴 4번(모바일 레이아웃).

| 순서 | 항목 | 내용 |
|------|------|------|
| 1 | ⑤+⑥ 저작 API id 기반 전환 + 404 | `server.py` edit/delete/save-grammar가 텍스트 대신 `card.id`로 카드 탐색(중복 텍스트 전체삭제 위험 제거). 대상 미발견 시 404 반환. `add-card`가 신규/기존 id를 응답에 포함해 방금 추가한 카드를 같은 세션에서 바로 수정/삭제해도 깨지지 않음. curl로 실서버 기동해 add/edit/delete/grammar id 매칭·404 케이스 검증 |
| 2 | ⑧ "최근 학습" 순차 모드 반영 | `state.ts`에 `touchLastStudied()` 분리(fail_count 안 건드리고 `_ts`만 갱신), 순차 모드 Space 플립(뒷면 확인) 시점에 호출. 안키 전용이던 최근 학습일 표시가 순차 모드도 반영 |
| 3 | ⑩ 자동 테스트 + CI | `node:test`+`--experimental-strip-types`(Node 22 내장, 의존성 0)로 `test/` 27건. 안키 큐 재배치(`anki-core.ts`)·사용자 델타 병합(`docs-merge.ts`)·lint 규칙·드릴다운 매칭을 순수 함수로 분리해 테스트 가능하게 함. `.github/workflows/ci.yml`(PR 트리거) 신설 + `deploy.yml`에도 테스트 스텝 추가. 부수 발견: `lint-data.mjs`의 CLI 가드가 한글 경로(`문독`)에서 URL percent-encoding 불일치로 무력화되던 버그 수정 |
| 4 | ⑨ 드릴다운 매칭 통합 + render.ts 분리 | `buildDrillMap`/`tokenizeHighlights`/`annotatedFront` 3중 복제를 `src/drill-match.ts`의 `findDrillSpans()` 단일 출처로 통합. render.ts(958줄)에서 `onboarding.ts`·`shortcut-help.ts`·`result-screen.ts`·`render-shared.ts` 분리 → 585줄. lint 드릴다운 WARN 건수 리팩터 전후 동일함으로 매칭 결과 불변 확인 |

세부 근거·검증 내역은 `IMPROVEMENTS.md` 해당 항목 참고. **다음 세션 후보**: 🟢 낮음 항목들(코드포인트/UTF-16 인덱스 혼용 통일, 원본 PDF 분리, 버전 문자열 하드코딩 등) 또는 보류 중인 🔴 4번(모바일 레이아웃).

---

## 📌 현재 상태 (2026-07-07)

`IMPROVEMENTS.md` 추천 착수 순서(① Tailwind → ③ 백업 → ② PWA → ⑦ streak) 4개 항목 완료·커밋 완료(`3eaf81a`).

| 항목 | 내용 |
|------|------|
| ① Tailwind 빌드 전환 | Play CDN 제거 → Tailwind v4 + `@tailwindcss/vite`. `src/style.css` 추가, `vite.config.ts`→`.mts`(ESM 플러그인 로드). 온보딩 슬라이드의 분리형 동적 클래스(`bg-${bg}`) 1건 수정. CSS 24.77KB(gzip 5.5KB) |
| ③ 백업 범위 확장 | `exportUserData`/`importUserData`가 `hanja-v2/` 접두사 전체 키(안키 오답·streak·최근학습일 포함) 대상으로 확장. 신 포맷(`{version:2,keys}`) + 구 포맷(userdata 단일 객체) 하위호환. grammar 항목까지 구조 검증 강화 |
| ② PWA 전환 | `public/manifest.json`(아이콘은 `icon.svg`를 `sips`로 192/512px 래스터화) + `public/sw.js`(앱 셸 stale-while-revalidate, 프로덕션 빌드에서만 등록) + `storage.persist()`. Google Fonts self-host는 레포 용량 문제로 SW 런타임 캐싱으로 대체 |
| ⑦ streak UTC→로컬 | `state.ts`에 `localDateStr()` 추가, `todayStr()`/어제 계산 양쪽에 적용. KST 08:30(UTC 전날 23:30) 경계 재현 테스트로 수정 확인 |

세부 근거·검증 내역은 `IMPROVEMENTS.md` 해당 항목 참고.

---

## 📌 현재 상태 (2026-06-30)

**배포 상태**: `refactor/csv-to-json` → `main` fast-forward 병합 후 push, **GitHub Pages 배포 완료**(2026-07-01, CI `33b203c` build+deploy 성공, 라이브 HTTP 200). 라이브: https://river11456.github.io/mundok/
병합 브랜치 `refactor/csv-to-json`은 정리(삭제)됨.

이 세션에서 마이그레이션 위에 8개 커밋 추가 배포: 여담론 문법 복구 · 양성편 s21 드릴다운 · 홈 키보드 수정 · 연결카드 일괄수정 프롬프트 · p6 정본 일치 · streak 부작용 분리 · 안키 큐 반영 · 포트 동적 탐색.

### 오늘 완료 — CSV → 문헌별 JSON 마이그레이션 (Phase 1~5 + 정리)

콘텐츠 저장을 `CSV + userdata.json` 델타 구조에서 **`src/data/*.json` 단일 진실**로 전환.
"텍스트 = 식별자" 구조 문제(드릴다운 추측·텍스트 수정 시 연결 끊김·진실 분열)를 해소.
세부 Phase 기록은 맨 아래 **🔴 데이터 아키텍처 개선** 섹션 참고.

| 커밋 | 내용 |
|------|------|
| `8885490` | Phase 1~3: CSV→JSON 무손실 변환 + 로더 교체 + server.py JSON 직접 편집 |
| `1fc37c0` | Phase 4a: 안키 학습기록 id 기반화 |
| `6d66d55` | Phase 5: 콘텐츠 무결성 빌드 lint |
| `69fdf35` | 정리: 구 CSV·userdata.json·죽은코드(`csv.ts`)·`papaparse` 제거 |

- **검증**: 변환 무손실(946장·문법19건), 서버 CRUD 통합 11/11, 안키 로직 7/7, 빌드·lint ERROR 0
- **부수 성과**: 여담론 고아 문법 1건 발견·격리 / edit 시 문법주석 유지 / 런타임 의존성 0개

### 남은 작업 (다음 세션 후보)

- [x] **배포** ✅ (2026-07-01) — `refactor/csv-to-json`→`main` fast-forward 병합 후 push, CI 빌드·배포 성공, 라이브 HTTP 200 확인
- [x] 여담론 고아 문법 1건 복구 ✅ (s21 `助` V 주석. 인덱스 5–6은 `充足` 텍스트에서도 그대로 유효 — `足`이 주석 범위 뒤라 보정 불필요)
- [x] 양성편 s21 드릴다운 보강 ✅ (`內外百病`·`自然不生` word 카드 추가 → s21 매칭 2건). s7·s8은 순수 숫자·시간 나열이라 보류(WARN 2건 잔존, 무해)
  - 근거: 전체 197개 부모카드 중 0건은 이 3개뿐 = 양성편 구조 문제 아닌 국소 저작공백. s7·s8 숫자 드릴다운은 교육 가치 낮아 의도적 보류
- [~] Phase 4b: LocalStore 편집 델타 id화 (보류 — 효용 낮음)
- [~] Phase 5a: 드릴다운 명시 링크 (보류 — 모호성 1건뿐, 자동매칭 충분)
- [x] 포트 동적 탐색 ✅ (server.py: 19234 우선 → 사용 중이면 OS 빈 포트 폴백 + `.runport` 기록. 런처: 무차별 kill 제거, 이미 떠 있으면 재사용)

---

## 파일 구조

```
문독/
├── src/
│   ├── main.ts        # 진입점
│   ├── types.ts       # Card, Level, LevelKey, Doc, Screen, Mode, Side 타입
│   ├── state.ts       # 전역 상태 S, DRILL_LEVELS, pushNav/popNav 등
│   ├── docs.ts        # import.meta.glob으로 JSON 자동 로드 → DOCS 배열
│   ├── render.ts      # 전체 화면 렌더링, tokenizeHighlights, annotatedFront
│   ├── events.ts      # 클릭 위임, 키보드 단축키
│   ├── anki.ts        # rate(1|2|3) — 안키 큐 알고리즘
│   ├── addcard.ts     # 카드 추가 모달 + 드래그 버블 + 네이버 한자사전 검색
│   ├── editcard.ts    # 카드 수정 모달
│   ├── backup.ts      # 정적 모드 데이터 내보내기/가져오기 FAB
│   ├── storage/       # 저장 계층 추상화 (Store / LocalStore / ServerStore)
│   └── data/
│       ├── 불치이병치미병.json
│       ├── 대의정성.json
│       ├── 식무구포.json
│       ├── 양성편.json
│       ├── 여담론.json       # 格致餘論 朱震亨
│       ├── 상고천진론.json   # 황제내경 소문
│       ├── 편작육불치.json
│       └── 사기조신대론.json # 황제내경 소문
│           (원본 PDF는 git에서 분리 — 관리자 로컬 ~/Documents/문독-원본PDF/)
├── scripts/           # lint-data.mjs — 콘텐츠 무결성 검사 (빌드 전 실행)
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

## JSON 콘텐츠 스키마

문헌 1개 = 파일 1개 (`src/data/<문헌>.json`). 타입 정의는 `src/types.ts`의 `DocJSON`/`CardJSON`.

```jsonc
{
  "id": "편작육불치",          // = 파일명 (docId·localStorage 키 호환 위해 한글 유지)
  "title": "扁鵲六不治",        // 표시 제목
  "sub": "편작육불치",          // 부제
  "levels": {
    "char": [ { "id": "c1", "text": "驕", "reading": "교만할 교", "meaning": "", "note": "" } ],
    "word": [ … ],
    "sentence": [
      { "id": "s1", "text": "驕恣不論於理 一不治也", "reading": "교자불론어리 일불치야",
        "meaning": "교만하고 …", "note": "",
        "grammar": [{ "type": "S", "start": 0, "end": 2 }],   // 카드 내장 문법 주석(sentence 전용)
        "drill":   [] }                                        // 명시 드릴 링크(옵션, 비면 자동매칭)
    ],
    "paragraph": [ … ]
  }
}
```

- **문헌 필드**: `id`, `title`, `sub`, `order?`(홈 화면 정렬 우선순위 — 작을수록 앞, 없으면 파일명 가나다순 뒤)
- **카드 필드**: `id`(문헌 내 안정·불변), `text`(앞면), `reading`, `meaning`(뒷면), `note`, `grammar?`, `drill?`
- `levels` 키: `char` | `word` | `sentence` | `paragraph`
- `reading`: 한자와 글자 수가 같으면 뒷면에서 각 한자 아래 발음 표시
- `grammar`: `type`(S/V/O/phrase) + `start`/`end`(text 코드포인트 인덱스). sentence 카드에만.
- **인덱스 좌표계**: 문법 주석·드릴다운 매칭 모두 **코드포인트** 기준으로 통일 (2026-07-08, BMP 밖 벽자 안전).
- 새 문헌 추가: JSON 파일을 `src/data/`에 넣고 `npm run build`. 무결성은 `scripts/lint-data.mjs`가 검사.

---

## 배포 구조 (정적 웹)

| 대상 | 필요한 것 | 방법 |
|------|----------|------|
| 일반 사용자 | (없음) | 브라우저로 `https://river11456.github.io/mundok/` 접속 |
| 관리자 (저작) | Git + Python3 + Node.js | 로컬에서 `server.py` 실행 → 편집 → `git push` |

- **호스팅**: GitHub Pages. `.github/workflows/deploy.yml` 이 `main` push마다 `npm ci && npm run build` 후 `dist/` 를 배포.
- **콘텐츠 베이킹**: `src/data/*.json` (문헌별 단일 진실) 을 빌드 시 번들에 포함 → 서버 없이 표시.
- **dist/ 는 커밋하지 않음** (CI가 빌드). `src/data/*.json` 이 콘텐츠 정본이라 **커밋함**.
- **빌드 전 lint**: `npm run build` 가 `scripts/lint-data.mjs` 로 무결성 검사 (ERROR 시 빌드 차단).

### 저장 계층 추상화 (`src/storage/`)

모든 영속화는 `Store` 인터페이스 뒤로 모임. 흩어진 `fetch('/api/...')` 제거됨.

| 구현 | 환경 | 저장 위치 |
|------|------|----------|
| `LocalStore`  | 정적 배포 | 브라우저 `localStorage` (키 `hanja-v2/userdata`) |
| `ServerStore` | 관리자 저작 (server.py 감지) | 파일 `src/data/*.json` 직접 편집 |
| *(미래)* `BackendStore` | 계정 동기화 | 서버 API — 이 파일 하나만 추가 |

- 환경 감지: 시작 시 `/api/version` 프로브 → 응답하면 `ServerStore`, 아니면 `LocalStore`.
- 콘텐츠 병합 순서(`docs.ts`): 베이킹된 `src/data/*.json` → 사용자 로컬 델타(정적 모드).
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
- **추가**: 텍스트 드래그 → 버블 → 모달 → JSON 반영
  - 한자 입력칸 옆 **검색** 버튼 → 네이버 한자사전 새 탭
- **수정**: 카드 우상단 수정 버튼 → 모달 → JSON 반영
- **삭제**: 카드 우상단 삭제 버튼 → 확인 → JSON 반영

> 카드 CRUD는 해당 문헌 `src/data/*.json`에 직접 기록 — 빌드 없이 즉시 반영(server.py가 id 자동채번).

### 참고문헌 그룹핑 (홈 화면)
- `src/docs.ts`의 `DOC_GROUPS` 배열로 부모-자식 문헌 관계 선언
- 홈 화면에서 부모 카드 아래 "참고문헌 N" 토글 버튼으로 접기/펼치기
- 토글은 DOM 직접 조작 (전체 리렌더 없음)
- 새 그룹 추가: `DOC_GROUPS`에 `{ parentId, childIds }` 한 줄 추가

### 라이브 리로드 (관리자 모드)
- `vite build --watch`로 JSON 변경 감지 → 자동 빌드 → 브라우저 자동 갱신
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
- [x] **Phase 4a — 안키 기록 id 기반** ✅ (2026-06-30)
  - `state.ts`: `개수 일치`(`saved.length===cards.length`) → 카드 id별 `fail_count` 맵(`.../fails` 키)
  - 구 포맷(Card[] 배열) → front 매칭으로 1회 자동 마이그레이션(`migrateOldAnki`), 구 키 정리
  - `resetAnki()` 추가, `events.ts` hardReset 교체
  - **검증**: 빌드 통과, 안키 로직 시뮬레이션 7/7 — 카드 추가/삭제에도 학습기록 유지·구 기록 보존·초기화 정상
- [~] **Phase 4b — LocalStore 편집 델타 id 기반** (보류)
  - 정적 사용자 edit/delete를 텍스트 대신 카드 id로 참조 (`docs.ts applyUserData`, `events.ts`, `storage/local.ts`)
  - **보류 사유**: 정적 사용자 편집은 소규모이고 관리자 편집은 이미 JSON 직접(Phase 3). 호환 마이그레이션(text→id) 비용 대비 효용이 낮음. 정적 편집이 실사용에서 늘면 재개.
- [x] **Phase 5 — 빌드 lint(구 ⑤) ✅ + 드릴다운 명시 링크(구 ②) 판단** (2026-06-30)
  - `scripts/lint-data.mjs` 작성, `package.json` build 에 연결 (ERROR 시 빌드 차단, WARN 통과)
    - ERROR: 카드 id 중복 / drill 링크 깨짐 / 문법 인덱스 범위 이상
    - WARN: 같은 레벨 중복 텍스트 / sentence·paragraph 드릴다운 0건
  - **현재 데이터**: ERROR 0건, WARN 4건 (양성편 `百刻` 중복 1, 드릴 0건 3건 = 양성편 s7·s8·s21)
  - **5a(명시 링크) 보류 — 데이터 근거**: 모호성(중복 텍스트)이 1건뿐이고 같은 뜻이라 자동 substring 매칭으로 충분. `drill` 필드는 스키마에 옵션 유지(미래 모호성 대비, lint 가 무결성 검사).

#### 남은 정리 작업

- [x] **데이터 정리** ✅ (2026-06-30) — lint 발견 항목
  - 양성편 `百刻` 중복 w10 제거 (w6 완전판 유지)
  - 여담론 `"故로 以菜助其充足은…"` 고아 문법 → **복구 완료** ✅ (s21에 `助` V 주석 `{start:5,end:6}` 재부여. 원본 인덱스가 `充足` 텍스트에서도 유효해 보정 불필요. lint·빌드 통과)
  - 양성편 s7·s8·s21 드릴다운 0건(숫자/시간 표현) → 데이터 완성도 이슈, 필수 아님(미해결)
- [x] **구 파일 정리** ✅ (2026-06-30) — `src/data/*.csv`·`userdata.json` 제거, 죽은 코드 `csv.ts`·일회성 `migrate-to-json.mjs`·미사용 `papaparse` 의존성 제거, README/PROGRESS JSON 기준 갱신 (git 히스토리에 남아 복원 가능)

### 🟡 기타

- [x] **포트 동적 탐색** ✅ (2026-06-30) — `server.py`가 19234 우선 시도, 사용 중이면 `OSError` 잡아 OS 빈 포트(`port 0`)로 폴백하고 실제 포트를 `.runport`에 기록(종료 시 삭제). 런처(`문독.command`/`문독.bat`)는 무차별 `kill -9` 제거 → 이미 우리 서버가 떠 있으면 그 포트로 브라우저만 열고, 아니면 `.runport`를 읽어 실제 포트로 접속. (⚠ `문독.bat`은 macOS에서 미검증)
