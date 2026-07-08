# 文讀 — 개선 필요 사항

> 2026-07-07 코드베이스 전수 검토 결과. 다음 세션에서 이 파일을 보고 작업을 이어간다.
> 항목을 완료하면 체크하고, 완료일과 커밋을 옆에 남길 것. 전체 맥락은 `PROGRESS.md` 참고.

**추천 착수 순서**: ① Tailwind 빌드 전환 → ③ 백업 범위 확장 → ② PWA → ⑦ streak UTC 수정
(①·③·⑦은 각각 반나절 이내 소단위. ②는 ①이 선행돼야 오프라인 캐싱이 의미 있음)

---

## 🔴 높음 — 실사용자에게 바로 영향

### 1. Tailwind Play CDN → 빌드 타임 CSS 전환

- [x] 완료 (2026-07-07)
- **위치**: `index.html:9` (`<script src="https://cdn.tailwindcss.com">`)
- **문제**: Play CDN은 개발 전용. 매 방문 ~300KB JS 다운로드 + 브라우저에서 런타임 스타일 생성 → 첫 로딩 지연·FOUC, 오프라인에서 스타일 전체 붕괴.
- **방법**: Tailwind CSS v4 + `@tailwindcss/vite` 플러그인 도입(별도 config 불필요, Vite 모듈 그래프 자동 스캔). `src/style.css`(`@import "tailwindcss";`)를 `main.ts`에서 import. CDN 스크립트 태그 제거. `vite.config.ts`→`.mts` 변경(ESM-only 플러그인 로드 문제 해결).
- **동적 클래스 수정**: `render.ts` 온보딩 슬라이드(구 758행)의 `bg-${bg}` 분리 조합 → 배열에 완전한 클래스명(`'bg-red-50'` 등)을 통째로 넣도록 수정. 그 외 코드베이스 전수 검색 결과 이 1건 외 분리형 동적 클래스 없음(나머지는 전부 완전한 리터럴 클래스 문자열 변수 삽입이라 스캐너가 정상 인식).
- **검증**: `npm run build` 통과, 산출 CSS 24.77KB(gzip 5.5KB, 구 CDN 런타임 대비 대폭 경량화). 소스 전체에서 사용된 모든 Tailwind 클래스 토큰(pseudo-class 포함)이 빌드된 CSS에 실제 생성됐는지 스크립트로 대조 확인.

### 2. PWA 전환 (매니페스트 + 서비스 워커)

- [x] 완료 (2026-07-07)
- **문제**: README는 "홈 화면에 추가해 앱처럼"이라 하지만 매니페스트가 없어 바로가기 수준. 오프라인 동작 불가.
- **핵심 동기**: iOS Safari는 7일 미접속 사이트의 localStorage를 삭제하는데(README 경고 참조), **홈 화면 설치형 PWA는 이 정책에서 제외** → 학습 데이터 유실의 근본 완화책.
- **작업**:
  - [x] `public/manifest.json` (이름 文讀, 아이콘 192/512px `public/icon-192.png`·`icon-512.png` — 기존 `icon.svg`를 `sips`로 래스터화, `display: standalone`, 테마색 `#F7F5F0`, `start_url`/`scope`는 `"."` 상대경로로 서브경로 배포 대응)
  - [x] `public/sw.js` — 앱 셸(HTML/JS/CSS) stale-while-revalidate 캐싱. `main.ts`의 `registerServiceWorker()`가 **프로덕션 빌드에서만** 등록(개발 모드 vite watch 라이브 리로드와 충돌 방지)
  - [x] `navigator.storage.persist()` 요청 추가 (`main.ts` `requestPersistentStorage()`)
  - [~] Google Fonts self-host → **대체 구현**: 파일을 레포에 내장하는 대신 `sw.js`가 `fonts.googleapis.com`/`fonts.gstatic.com` 요청을 캐시 우선 전략으로 런타임 캐싱. 오프라인 한자 폰트 유지라는 목적은 동일하게 달성하면서 레포 용량 증가(기존 8.4MB PDF 이슈와 별개로 또 발생) 회피. 완전한 self-host가 필요해지면 재검토.
  - `index.html`에 `<link rel="manifest">`·`<link rel="apple-touch-icon">`·`<meta name="theme-color">` 추가
  - ⚠ 캐시 무효화: `sw.js`의 `CACHE_NAME`/`FONT_CACHE` 버전 문자열은 수동 관리(빌드 해시 자동 연동 없음) — 앱 셸이 크게 바뀌는 배포 시 버전 문자열을 올릴 것. 소규모 앱 특성상 자동화 생략, stale-while-revalidate라 온라인 사용자는 항상 최신으로 갱신됨.
- **검증**: `npm run build` 통과, `vite preview`로 `manifest.json`·`sw.js`·아이콘 2종 정적 서빙(200) 확인. GitHub Pages 서브경로(`/mundok/`) 대응은 전부 상대경로로 처리해 별도 설정 불필요.

### 3. 백업에 학습기록 포함

- [x] 완료 (2026-07-07)
- **위치**: `src/storage/index.ts` (`exportUserData`/`importUserData`)
- **문제**: "내 데이터 내보내기"가 `hanja-v2/userdata`(카드 편집 델타)만 내보냄. 안키 오답 맵(`hanja-v2/<doc>/<level>/fails`), 최근 학습일(`_ts`), streak(`hanja-v2/streak`)은 미포함 → 기기 이전 시 학습 진도 전부 유실.
- **방법**: `hanja-v2/` 접두사 전체 키를 `{version:2, keys:{...}}` 포맷으로 내보내도록 확장. 가져오기는 신 포맷(전체 키 복원) + 구 포맷(userdata 단일 객체, 하위호환) 둘 다 인식. 신 포맷 내 키는 `hanja-v2/` 접두사인지 검증(임의 키 주입 방지) + userdata 항목은 구조 검증(`validateUserData`, grammar 항목·annotation 타입까지 확인 — 낮음-6 겸사 처리). `backup.ts` 안내 문구도 "카드"→"카드와 학습 기록"으로 갱신.
- **검증**: 순수 로직을 별도 스크립트로 추출해 10가지 케이스(왕복 복원·구 포맷 호환·형식 오류 거부·grammar 타입 오류 거부·접두사 아닌 키 주입 거부) 스모크 테스트 통과. `npm run build` 통과.

### 4. 모바일 레이아웃 점검

- [~] 보류 (2026-07-07, 사용자 지시로 후순위 연기)
- **위치**: `index.html:34` (`<body class="min-h-screen flex items-center justify-center p-12">`)
- **문제**:
  - flex 센터링 + 콘텐츠가 화면보다 길면 **상단이 잘려 스크롤로도 접근 불가** (단락 카드·결과 테이블에서 발생 가능) — `margin: auto` 패턴이나 `safe center`로 해결
  - `p-12`(3rem) 바디 여백 + 카드 `px-16 py-14`는 폰 화면에서 과다 → 반응형 축소
  - 카드 추가(드래그 선택)·드릴다운 힌트(`title` hover)가 터치에서 어색 — 장기 과제로 분리 가능
- **검증**: iPhone SE급 좁은 화면에서 전 화면 확인.

---

## 🟡 중간 — 정합성·유지보수

### 5. 저작 API 텍스트 키 → 카드 id 키

- [x] 완료 (2026-07-08)
- **위치**: `server.py` `_edit_card`/`_delete_card`/`_save_grammar` (텍스트로 카드 탐색), 클라이언트 `src/events.ts:79-82`(delete가 `card.front` 전달), `src/editcard.ts`, `src/grammar-edit.ts`
- **문제**: 마이그레이션 핵심이 "텍스트=식별자 탈피"였는데 CRUD API는 아직 텍스트 키. 중복 텍스트 시 `_delete_card`는 일치하는 카드를 **전부** 삭제.
- **방법**: 클라이언트는 이미 `card.id` 보유 → API 바디에 `id` 전달로 전환(`edit-card`/`delete-card`/`save-grammar`). `LocalStore`(정적 모드)는 텍스트 델타 유지(Phase 4b 보류와 일관) — 서버 모드만 전환.
  - `_add_card`도 새/기존 카드의 `id`를 응답에 포함하도록 확장 → 방금 추가한 카드를 같은 세션에서 바로 수정/삭제해도(라이브 리로드 억제 구간) 클라이언트가 실제 서버 id를 갖게 되어 깨지지 않음(`store().addCard()` 반환값 `Promise<string>`으로 변경).
  - `editcard.ts`의 카드 패치·`addcard.ts`의 delete 필터도 텍스트(`front`) 대신 `id` 기준으로 바꿔 중복 텍스트 카드 오조작 가능성 제거.
- **검증**: `npm run build`(tsc+vite) 통과. 실제 서버 기동 후 curl로 add(신규/중복)·edit·delete·save-grammar id 매칭 확인, 원본 JSON과 diff로 부작용 없음(백업/복원) 확인.

### 6. 저작 API 대상 미발견 시 오류 반환

- [x] 완료 (2026-07-08, 5번과 함께 처리)
- **위치**: `server.py:193-218` (edit/delete/grammar)
- **문제**: 카드를 못 찾아도 조용히 no-op 후 `ok: true` → 화면-파일 desync를 관리자가 인지 못함.
- **방법**: 미발견 시 `404` + 에러 메시지(`카드를 찾을 수 없습니다`) 반환. 클라이언트 `post()`는 기존처럼 `!data.ok`면 throw하므로 `editcard.ts`/`addcard.ts`는 기존 catch가 자동으로 처리, `grammar-edit.ts`는 기존에 없던 try/catch + alert 추가.
- **검증**: curl로 존재하지 않는 id에 edit/delete/save-grammar 요청 → 404 + `{"ok":false,"error":"카드를 찾을 수 없습니다"}` 확인.

### 7. streak 날짜 기준 UTC → 로컬

- [x] 완료 (2026-07-07)
- **위치**: `src/state.ts` `todayStr`(구 `toISOString` 기반), `recordStudySession`의 어제 계산
- **문제**: 날짜 경계가 KST 오전 9시 → 밤 11시 학습과 다음날 아침 8시 학습이 같은 날로 집계, 연속 학습일 왜곡.
- **방법**: `localDateStr(d)` 헬퍼(`getFullYear/Month/Date` 조합)를 추가해 `todayStr()`과 어제 계산(`recordStudySession`) 양쪽에서 `toISOString()` 대체. 기존 저장값은 포맷 동일(YYYY-MM-DD)하므로 마이그레이션 불필요.
- **검증**: `TZ=Asia/Seoul` node 스크립트로 KST 08:30(=UTC 전날 23:30) 경계 케이스 재현 — 구 로직(UTC)은 전날 날짜로 잘못 기록, 수정 로직은 정확히 당일 날짜로 기록됨을 확인. `npm run build` 통과.

### 8. "최근 학습"이 안키 모드만 반영

- [x] 완료 (2026-07-08)
- **위치**: `src/state.ts:91-96` (`persist`에서만 `_ts` 기록 — 안키 rate 경로 전용)
- **문제**: 순차 모드로만 공부한 문헌은 홈 화면에 최근 학습일 미표시.
- **방법**: `state.ts`에 `touchLastStudied()` 분리(fail_count 맵은 건드리지 않고 `_ts`만 기록, `persist()`도 이를 재사용). "학습했다" 기준 = **뒷면(뜻)을 실제로 확인한 시점**(Space로 카드를 뒤집을 때) — 안키 모드가 `rate()` 시점(뒷면을 본 뒤 난이도 평가)에 기록하는 것과 대응시킴. `events.ts` seq 모드 Space 핸들러에서 `S.seqFlipped`가 true로 바뀔 때만 호출(뒤집기→원위치는 기록 안 함).
- **검증**: `npm run build` 통과. 카드 클릭 플립은 없고 키보드 Space가 유일한 플립 경로임을 코드에서 확인(다른 트리거 누락 없음).

### 9. 드릴다운 매칭 로직 3중 복제 해소 + render.ts 분리

- [x] 완료 (2026-07-08)
- **위치**: `src/render.ts` — `buildDrillMap`(74-101) / `tokenizeHighlights`(279-321) / `annotatedFront`(341-384)가 같은 substring 매칭 알고리즘을 각자 구현
- **문제**: 한 곳만 고치면 나머지가 어긋나는 구조.
- **방법**:
  - `src/drill-match.ts` 신설 — `findDrillSpans(text, candidates)`(긴 텍스트 우선·비중첩 그리디 매칭, 순수 함수) 단일 출처로 통합 + `spansByStart`/`spansByIndex` 두 조회 헬퍼(구간 단위로 건너뛰는 `annotatedFront`용 / 글자 단위 상태 기계인 `renderGrammarSentence`용). 인덱싱 방식(UTF-16 기반)은 기존 그대로 보존 — 코드포인트 혼용 이슈(🟢 낮음 항목)는 범위 밖으로 남겨둠.
  - `render.ts`(958줄)에서 분리: `src/onboarding.ts`(온보딩 슬라이드), `src/shortcut-help.ts`(단축키 도움말 모달), `src/result-screen.ts`(안키 결과 화면), `src/render-shared.ts`(`$app`/`esc`/`backBtn`/`homeBtn` 공용 헬퍼). `main.ts`/`events.ts`의 import 경로도 갱신.
  - 결과: render.ts 958줄 → 585줄.
- **검증**: `npm run build`(lint+tsc+vite) 통과 — lint의 드릴다운 매칭 WARN이 리팩터 전후 정확히 동일(양성편 s7·s8 2건)해 매칭 결과가 바뀌지 않았음을 데이터로 확인. `test/drill-match.test.ts`(7건) 신설로 최장매칭 우선·비중첩·복수 출현·두 조회 헬퍼를 단위 테스트. 서버 기동 후 브라우저로 열어 육안 확인 절차 안내(이 환경엔 headless 브라우저 도구가 없어 클릭/스크린샷 자동화는 못 함 — 사용자 확인 필요).

### 10. 자동 테스트 + CI PR 검증

- [x] 완료 (2026-07-08)
- **문제**: 마이그레이션 때의 검증(서버 CRUD 11건, 안키 로직 7건)이 일회성이라 저장소에 없음. CI(`deploy.yml`)는 main push 빌드만.
- **방법**: `node:test` + `node --experimental-strip-types`(Node 22 내장, 의존성 0)로 `test/` 아래 3개 스위트 20건.
  - 순수 로직을 테스트 가능한 형태로 먼저 분리(동작 동일, 호출부만 위임):
    - `src/anki-core.ts` — `anki.ts`의 안키 큐 재배치 로직을 `reinsertAfterRating()`으로 추출
    - `src/docs-merge.ts` — `docs.ts`의 `applyUserData`/`mergeGrammar`를 `DOCS` 전역 대신 `docs` 인자를 받는 순수 함수로 추출
    - `scripts/lint-data.mjs` — `lintDoc(dj)`를 export하고, 실제 파일 스캔+출력+`process.exit`는 CLI로 직접 실행됐을 때만 실행되도록 가드
  - `test/anki-core.test.ts`(6건) · `test/docs-merge.test.ts`(7건) · `test/lint-data.test.mjs`(7건)
  - `package.json`에 `"type": "module"` 추가(경고 제거) + `"test": "node --experimental-strip-types --test"` 스크립트
  - `.github/workflows/ci.yml` 신설(`pull_request` 트리거, `npm ci && npm run build && npm test`) + 기존 `deploy.yml`(main push)에도 `npm test` 스텝 추가해 배포 전 검증
- **부수 발견·수정**: `lint-data.mjs`의 CLI 가드(`import.meta.url === file://${process.argv[1]}`)가 저장소 경로에 한글(`문독`)이 포함되면 URL percent-encoding 불일치로 항상 거짓이 되는 버그 발견 → `fileURLToPath`로 디코딩 후 비교하도록 수정.
- **검증**: `npm run build`(lint+tsc+vite) 통과, `npm test` 20/20 통과.

---

## 🟢 낮음 — 여유 있을 때

- [ ] **코드포인트 vs UTF-16 인덱스 혼용** — 문법 주석은 `[...text]` 코드포인트, 드릴다운 매칭은 `indexOf` UTF-16. `renderGrammarSentence`(render.ts:203-235) 상태 기계에서 둘이 섞임 → BMP 밖 벽자(CJK 확장 B) 유입 시 표시 어긋남. 9번 리팩터 시 함께 통일 권장.
- [ ] **원본 PDF 8.4MB 저장소 분리** — `src/data/original/` (저장소 8.6MB의 대부분). Release 자산·Drive 등으로 이동, README에 위치 기록. ⚠ git 히스토리에서도 빼려면 history rewrite 필요 — 비용 대비 판단.
- [ ] **버전 문자열 하드코딩** — 홈 화면 `v1.0.0 · KJH`(render.ts:490)를 `package.json` 버전에서 주입(`import pkg from '../package.json'` 또는 vite define). package.json 이름도 구명칭 `hanja-crusher` → `mundok` 정리.
- [x] **Google Fonts 오프라인 유지** ✅ (2026-07-07, 2번 PWA와 함께 처리) — self-host 대신 `sw.js` 런타임 캐싱으로 구현(레포 용량 회피).
- [ ] **server.py `time` import 미사용** (server.py:8) — 제거.
- [x] **백업 가져오기 검증 강화** ✅ (2026-07-07, 3번과 함께 처리) — `validateUserData`가 additions/edits/deletions 배열 + grammar 항목·annotation 타입까지 검증.
- [ ] **`문독.bat` Windows 미검증** — Windows 기기 확보 시 포트 폴백(`.runport`) 동작 확인.
- [ ] **홈 화면 순서 = 파일명 가나다순** — 순서 조정이 파일명 변경을 요구(docs.ts:21). JSON에 `order` 필드 추가가 유연.

---

## 검토에서 확인만 하고 넘어간 것 (문제 아님)

- XSS: 사용자 입력은 `esc()`/`ecEsc()`로 이스케이프됨 — 정상
- `server.py`는 127.0.0.1 바인딩 — 외부 노출 없음
- 전체 innerHTML 리렌더 방식 — 현 규모에서 성능 문제 없음, 이벤트 위임 사용 중
- 카드 edit 시 내장 grammar 보존(Phase 3 부수 개선) — 동작 확인
