# SPEC.md — 文讀 기능·데이터 명세 (as-is)

> **기준**: v1.19.2 + 미커밋 작업(해석 순서 `interp`). 2026-07-29 전수 조사 — 교재 스테이징은 2026-07-31 정리됨(4.1절).
>
> **문서 역할 구분** — 겹치지 않게 유지할 것:
> | 문서 | 답하는 질문 |
> |---|---|
> | **SPEC.md** (이 문서) | 지금 **무엇이 있는가** + 무엇을 고칠 것인가 (7절) |
> | `PROGRESS.md` | 언제 무엇을 했는가 (시간순 로그) |
> | `ROADMAP.md` | 무엇을 만들 것인가 |
>
> 구 `IMPROVEMENTS.md`(전 항목 완료) · 구 `RENEWAL.md`(미착수분은 ROADMAP Phase 3·4로 이식)는 2026-07-31 삭제 — 세부 내역은 git 히스토리 참조.
>
> **운영 규칙**: 새 기능은 3절 표에 한 줄로 추가될 수 있어야 한다. 한 줄로 안 들어가면 기능이 복잡한 게 아니라 **데이터 모델이 부족한** 것이다.

---

## 1. 실행 모드 2종

앱 시작 시 `/api/version` 프로브 1회로 갈린다 (`storage/index.ts:initStore`).

| | 정적 모드 (`LocalStore`) | 관리자 저작 모드 (`ServerStore`) |
|---|---|---|
| 대상 | 일반 사용자 (GitHub Pages) | 관리자 로컬 (`server.py` 기동) |
| 콘텐츠 정본 | 번들 베이킹분 + `localStorage` | `src/data/*.json` 파일 |
| 카드 편집 반영 | localStorage 델타 / user-docs | 파일 직접 수정 → `vite --watch` 재빌드 |
| 전용 기능 | 문헌 받기, 백업 FAB | 그룹 편집, 새 문헌을 `src/data/`에 생성 |
| 비노출 기능 | 그룹 편집 | 문헌 받기, 백업 FAB |

---

## 2. 화면·오버레이 (표 A)

`Screen` 타입은 **3개**다 (`types.ts:1`): `home` | `level` | `study`.

> ⚠ **문서 stale**: `README.md`·`PROGRESS.md`가 아직 `home → mode → level → study`로 적고 있다. `mode` 화면은 v1.5.0에서 **문헌 상세 오버레이**로 흡수돼 존재하지 않는다.

| 화면 | 진입 | 이탈 | 단축키 |
|---|---|---|---|
| `home` (서가) | 앱 시작, 홈 버튼 | 표지 클릭 → 오버레이 | `1`~`9` 문헌 열기 |
| `level` (단위 선택) | 오버레이의 순차/안키 버튼 | `Esc` → 오버레이 | `1`~`N` 단위 선택 |
| `study` (순차) | 단위 선택 | `Esc` → level (드릴다운 중이면 상위 카드) | `Space` 뒤집기 / `←` `→` `Enter` 이동 / `G` 문법 |
| `study` (안키) | 단위 선택 | `Esc` → level | `Space` 뒤집기 / `1` `2` `3` 평가 / `R` 재시작 / `Ctrl+Shift+R` 기록 초기화 |

오버레이·모달 (화면이 아니라 DOM 주입 레이어 — `Screen` 상태 밖):

| 레이어 | DOM id | 진입 | 모드 |
|---|---|---|---|
| 문헌 상세 | `.doc-overlay` (홈 렌더에 포함) | 표지 클릭 | 공통 · `Enter` 순차 / `⇧Enter` 안키 / 숫자키 참고문헌 |
| 카드 추가 | `ac-overlay` | 본문 셀 스윕 선택 → 버블 | 공통 |
| 카드 수정 | `ec-overlay` | 카드 도구 ✎ | 공통 |
| 연결카드 일괄수정 | `ce-overlay` | 카드 수정 저장 시 자동 감지 | 공통 |
| 문헌 마법사 (생성·본문추가·정보수정) | `dc-overlay` | 홈 새 문헌 타일 / 오버레이 버튼 | 공통 |
| 문헌 받기 (카탈로그) | `ct-overlay` | 홈 '문헌 받기' 타일 | 정적 전용 |
| 그룹 편집 | `ge-overlay` | 홈 첫 선반 '그룹 편집' | **서버 전용** |
| 온보딩 | (onboarding.ts) | 첫 방문 | 공통 |
| 단축키 도움말 | (shortcut-help.ts) | `?` | 공통 |
| 백업 팝오버 | `bk-pop` | ⤓ FAB (좌하단) | 정적 전용 |

---

## 3. 기능 인벤토리 (표 B)

**읽기/쓰기 열은 4절 표 C의 저장 위치 이름을 쓴다.** 메모리 전용 상태(`S.*`)는 표기 생략.

### 3.1 학습

| # | 기능 | 트리거 | 읽는 데이터 | 쓰는 데이터 |
|---|---|---|---|---|
| L1 | 서가 홈 표지 목록 | 홈 진입 | 베이킹 문헌, `_groups`, user-docs, `<doc>/<lv>_ts`, `streak`, `shelves-collapsed` | — |
| L2 | 이어서 학습 히어로 | 홈 진입 | `last-session`, 문헌 | — |
| L3 | 이어하기 | 히어로 버튼 | `last-session` | `last-session` |
| L4 | 문헌 상세 오버레이 | 표지 클릭 / 숫자키 | 문헌, `_groups.refs`, `<doc>/<lv>_ts` | — |
| L5 | 순차 재생 | 오버레이 `순차 재생` / `Enter` | 레벨 카드 | `last-session` |
| L6 | 안키 모드 | 오버레이 `안키 모드` / `⇧Enter` | 레벨 카드, `<doc>/<lv>/fails` | `last-session` |
| L7 | 카드 뒤집기 | `Space` / 카드 탭 / `정답 보기` | 카드 | `<doc>/<lv>_ts` (순차 첫 플립 시) |
| L8 | 난이도 평가 | `1` `2` `3` / 버튼 | 안키 큐 | `<doc>/<lv>/fails`, `<doc>/<lv>_ts`, `last-session` |
| L9 | 결과 화면 | 안키 큐 소진 | 큐 통계 | `streak` (완료 시 1회) |
| L10 | 안키 재시작 | `R` / 버튼 | `<doc>/<lv>/fails` | — |
| L11 | 안키 기록 초기화 | `Ctrl+Shift+R` | — | `<doc>/<lv>/fails` 삭제 |
| L12 | 드릴다운 | 밑줄 구간 클릭 | 하위 레벨 카드 (**자동 substring 매칭** — 저장된 링크 아님) | — |
| L13 | 독음 표시 | 뒤집기 시 자동 | `card.reading` (`alignReading` 1:1 정렬, 실패 시 통째 표시) | — |
| L14 | 문법 표시 | 文 메뉴 `문법 표시` / `G` | `card.grammar` | — |
| L15 | 해석 순서 재생 | 카드 도구 ▶ | `card.interp` | — |
| L16 | 선반 접기 | 선반 헤더 ▸ | `shelves-collapsed` | `shelves-collapsed` |
| L17 | 온보딩 | 첫 방문 | `onboarding-seen` | `onboarding-seen` |
| L18 | 단축키 도움말 | `?` | — | — |

### 3.2 저작 — 카드

세 저장소가 **같은 UI, 다른 정합성 규칙**을 쓴다 (→ 7절 P2).

| # | 기능 | 트리거 | 정적·베이킹 문헌 | 정적·사용자 문헌 | 서버 모드 |
|---|---|---|---|---|---|
| A1 | 카드 추가 | 셀 스윕 선택 → 버블 → 모달 | `userdata.additions` (텍스트 키, 합성 id) | `user-docs` 직접 (id 채번) | `POST /api/add-card` → 파일 |
| A2 | 카드 수정 | 카드 도구 ✎ | `userdata.edits` (origText 키) | `user-docs` 직접 (id) | `POST /api/edit-card` (id) |
| A3 | 연결카드 일괄수정 | A2 저장 시 상위 카드 자동 감지 | 위와 동일 (대상별 반복) | 동일 | 동일 |
| A4 | 카드 삭제 | 카드 도구 🗑 | `userdata.deletions` (텍스트 키) | `user-docs` 직접 (id) | `POST /api/delete-card` (id) |
| A5 | 문법 주석 편집 | 文 메뉴 `문법 편집` → 드래그 → S/V/O/구절 | `userdata.grammar` (**cardFront 키**) | `user-docs` 카드 내장 | `POST /api/save-grammar` (id) |
| A6 | 해석 순서 편집 | 文 메뉴 `해석 순서 편집` → 드래그 토글 | `userdata.interp` (**cardFront 키**) | `user-docs` 카드 내장 | `POST /api/save-interp` (id) |

### 3.3 콘텐츠 수급

| # | 기능 | 트리거 | 읽는 데이터 | 쓰는 데이터 | 모드 |
|---|---|---|---|---|---|
| C1 | 새 문헌 만들기 | 홈 `새 문헌` 타일 → 3단 마법사 | — | `user-docs` (`u1`…) | 정적 |
| C1′ | 같은 기능, 서버 모드 | 동일 | — | `src/data/<id>.json` 생성 (`POST /api/create-doc`) | 서버 |
| C2 | 본문 추가 | 오버레이 `본문 추가` | `user-docs` | `user-docs` | 정적 |
| C3 | 문헌 정보 수정 | 오버레이 `정보 수정` | `user-docs` | `user-docs` | 정적 |
| C4 | 문헌 삭제 | 오버레이 `문헌 삭제` | `user-docs` | `user-docs` + `hanja-v2/<docId>/*` 전부 삭제 | 정적 |
| C5 | 문헌 받기 | 홈 `문헌 받기` 타일 | `dist/catalog/index.json`, `<id>.json` | `user-docs` (+`source` 메타) | 정적 |
| C6 | 카탈로그 업데이트 | 같은 항목 `업데이트` | 위 + 설치본 `source.version` | `user-docs` **통째 교체** (직접 수정분 소실 · 카드 id 유지로 학습기록 보존) | 정적 |

### 3.4 조직화

| # | 기능 | 트리거 | 읽는 데이터 | 쓰는 데이터 | 모드 |
|---|---|---|---|---|---|
| O1 | 선반(그룹) 편집 | 홈 첫 선반 `그룹 편집` | `_groups.json` | `_groups.json` (`POST /api/save-groups`) | **서버 전용** |
| O2 | 참고문헌 스택·오버레이 | 자동 | `_groups.refs` | — | 공통 |
| O3 | 홈 정렬 | 자동 | `_groups.shelves` 순서 → 미분류 → `내 문헌` | — | 공통 |

> ⚠ **일반 사용자는 문헌을 정리할 수 없다.** 사용자 문헌·설치본은 전부 고정 선반 `내 문헌`에 들어가고, 순서·그룹을 바꿀 수단이 없다 (→ 7절 P8).

### 3.5 데이터 보험

| # | 기능 | 트리거 | 읽는 데이터 | 쓰는 데이터 | 모드 |
|---|---|---|---|---|---|
| B1 | 내보내기 | ⤓ FAB → `내 데이터 내보내기` | `hanja-v2/` 접두사 **전체 키** | 파일 다운로드 (`{version:2, exportedAt, keys}`) | 정적 |
| B2 | 가져오기 | ⤒ `백업 파일에서 가져오기` | 백업 파일 | `hanja-v2/` 키 전체 덮어쓰기 → 새로고침 | 정적 |

---

## 4. 데이터 저장 위치 전수 (표 C)

**계층** 열은 8절에서 확정한 v2 3계층 분류 — 현재 코드에는 이 구분이 없다.

### 4.1 파일 (관리자 소유, git)

| 경로 | 개수 | 내용 | 스키마 | 계층 |
|---|---|---|---|---|
| `src/data/*.json` | 8 | 베이킹 문헌 정본 (번들에 포함) | `DocJSON` | Content |
| `src/data/_groups.json` | 1 | 선반 + 참고문헌 관계 | `GroupsJSON` | Content(조직화) |
| `catalog/*.json` | 73 | 다운로드 배포 문헌 | `DocJSON` (+`version`) | Content |
| `dist/catalog/index.json` | 빌드 산출 | 카탈로그 목록 | `{docs:[{id,title,sub,color,version,cards}]}` | Content |
| `src/data/textbook/_manifest.json` | 1 | 교재 79문헌 출처 메타 — 원전·저자·교재 지면·PDF 페이지·검증 status, skipped 6건(베이킹 중복) 판단 기록 포함 | 독자 스키마 | Content(메타) |

- `src/data/textbook/`은 **런타임에 로드되지 않는다**: `docs.ts`의 glob이 `./data/*.json`이라 하위 디렉터리를 타지 않고, `lint-data.mjs`도 `src/data` 최상위만 스캔한다.
- 스테이징 정리(2026-07-31): JSON 사본 73개는 catalog와 전수 대조(id·title·sub·levels 동일, catalog 쪽 `order`만 추가) 후 삭제, OCR PDF는 `~/Documents/문독-원본PDF/` 이동(체크섬 검증). `_manifest.json`만 커밋 보존 — DocJSON 이전은 v2에서(P9).
- `catalog/`는 `lint-data.mjs`가 `src/data/`와 같은 규칙으로 검사한다 (+`id`=파일명, `version`≥1 정수).

### 4.2 localStorage (사용자 소유) — 전 9종

| 키 | 내용 | 스키마 | 키 방식 | 백업 | 계층 |
|---|---|---|---|---|---|
| `hanja-v2/userdata` | 베이킹 문헌 편집 델타 | `UserData` {additions, edits, deletions, grammar, interp} | **텍스트** | ✅ | Content |
| `hanja-v2/user-docs` | 사용자 문헌 + 카탈로그 설치본 | `DocJSON[]` | **id** | ✅ | Content |
| `hanja-v2/<docId>/<lv>/fails` | 카드별 누적 오답 수 | `Record<cardId, number>` | id | ✅ | Progress |
| `hanja-v2/<docId>/<lv>_ts` | 최근 학습 시각 | `number` (epoch ms) | — | ✅ | Progress |
| `hanja-v2/last-session` | 마지막 학습 위치 | `LastSession` {docId, lvKey, mode, idx, total, ts} | — | ✅ | Progress |
| `hanja-v2/streak` | 연속 학습일 | `StreakData` {lastDate, count, todayCards} | — | ✅ | Progress |
| `hanja-v2/shelves-collapsed` | 선반 접힘 상태 | `string[]` (shelfId) | — | ✅ | Preference |
| `hanja-v2/onboarding-seen` | 온보딩 완료 | `'1'` | — | ✅ | Preference |
| `hanja-v2/<docId>/<lv>` | **구 포맷** 안키 배열 | `Card[]` | 개수 일치 | — | 폐기 (첫 로드 시 `migrateOldAnki`가 변환·삭제) |

**추상화 누수**: `Store` 인터페이스는 Content만 담당한다. Progress·Preference는 `localStorage`를 직접 호출한다 — `state.ts` 14곳, `user-docs.ts` 3곳, `onboarding.ts` 5곳 (→ 7절 P3).

### 4.3 server.py API (서버 모드)

`GET /api/version` · `POST /api/create-doc` `add-card` `edit-card` `delete-card` `save-grammar` `save-interp` `save-groups`. 전부 `src/data/` 파일을 원자적으로 다시 쓴다. 127.0.0.1 바인딩.

---

## 5. 초기화·병합 순서

`main.ts:init()` → `initDocs()` (`docs.ts:120`):

```
1. initStore()                    /api/version 프로브 → LocalStore | ServerStore
2. import.meta.glob               src/data/*.json (_ 제외) → DOCS  [order → 파일명 정렬]
3. syncUserDocs()                 정적 모드만: user-docs → DOCS 뒤에 append (userDoc: true)
4. store().loadDelta()            정적: hanja-v2/userdata / 서버: null
5. applyUserData(DOCS, delta)     deletions → edits → additions  (전부 텍스트 매칭)
6. applyInterpDelta(DOCS, ...)    (docId, cardFront) 매칭
7. initGrammar(mergeGrammar(...)) 베이킹 내장 + user-docs 내장 + 델타  ((docId, cardFront) 키)
```

- 안키 기록(`fails`)은 여기서 안 읽는다 — 학습 시작 시 `loadAnki(cards)`가 카드 id로 조회.
- 드릴다운 링크는 저장되지 않는다 — 매 렌더마다 `findDrillSpans`가 하위 레벨 카드 텍스트로 substring 재계산.

---

## 6. 콘텐츠 실측 현황 (2026-07-29)

| 출처 | 문헌 | 카드 | `reading` 채워짐 | `meaning` 채워짐 |
|---|---|---|---|---|
| `src/data/` 베이킹 | 8 | 1,062 | — | 613 (**57%**) |
| `catalog/` 배포 | 73 | 2,119 (전부 `sentence`) | 0 (**0%**) | 0 (**0%**) |

- 카탈로그 73문헌은 **원문 문장만** 있다 (현토 포함, `char`·`word`·`paragraph` 레벨은 빈 배열). `_manifest.json`의 `"levels.sentence만 채움"` 그대로다.
- 그런데 카탈로그 목록 UI는 `장수`만 노출한다 — 사용자가 `기혈다소`를 받으면 **뜻·독음 없는 7장**을 받는다. 완성도를 표현하는 필드가 스키마에 없다 (→ 7절 P10).

---

## 7. 인벤토리에서 드러난 구조 문제

| # | 문제 | 근거 | 영향 |
|---|---|---|---|
| **P1** | **콘텐츠 정본 3곳** — `src/data/`(8) · `catalog/`(73) · `user-docs`(설치본). textbook 스테이징 사본은 2026-07-31 정리 | 4.1 | 같은 문헌이 단계마다 사본(카탈로그↔설치본 등). 승격·동기화 규칙이 코드에 없고 수동 |
| **P2** | **편집 경로 2종** — 베이킹 문헌은 텍스트 키 델타, 사용자 문헌은 id 직접 | 3.2, `types.ts:44,55` | 2026-06-30에 해소한 "텍스트=식별자" 버그가 델타 경로에만 잔존 (Phase 4b 보류). 텍스트 수정 시 문법·해석 고아화 — `docs-merge.ts:65` 주석이 "알려진 한계"로 명시 |
| **P3** | **Progress가 `Store` 밖** | 4.2, `localStorage` 직접 22곳 | `BackendStore` 하나 추가로 동기화된다는 설계 의도가 성립하지 않음 |
| **P4** | **전역 id 없음** — `docId`=한글 파일명 / `u{n}`, `cardId`=문헌 내 순번, 델타 추가 카드는 합성 id `${docId}_${type}_${text}` | `local.ts:62`, `user-docs.ts:19` | 다기기·다사용자에서 충돌. 카탈로그 업데이트를 머지할 수 없어 통째 교체 |
| **P5** | **`schemaVersion` 없음** | `types.ts:108` | 옵션 필드 8개(`order` `color` `updatedAt` `version` `source` `grammar` `interp` `drill`)가 누적됐지만 "지금 유효한 형태"가 미선언 → 필드 추가마다 판단 재발명 |
| **P6** | **Progress가 스칼라** — 카드별 `fail_count` 하나 | 4.2 | 언제·어떻게 틀렸는지 이력이 없어 SRS·통계·취약점 분석 전부 불가. 나중에 도입하면 과거 기록 소실 |
| **P7** | **카탈로그 업데이트 = 통째 교체** | `user-docs.ts:137`, `catalog.ts:131` | 사용자 수정분 소실을 confirm으로 경고할 뿐. 3-way 머지 불가 |
| **P8** | **조직화가 관리자 전유** | 3.4, `render.ts:413` | 사용자는 자기 서가를 정리할 수 없음. 카탈로그 73개 규모에서 `내 문헌` 선반이 무너짐 |
| **P9** | **출처 메타 유실** | 4.1 | `_manifest.json`의 원전·저자·교재 지면·검증 status가 `catalog/` DocJSON으로 안 넘어감. `DocJSON`에 해당 필드가 없음 — 상용 서비스에서 표시해야 할 정보. (`_manifest.json`은 2026-07-31 커밋 보존 — 스키마 이전은 v2에서) |
| **P10** | **완성도 표현 없음** | 6절 | 카탈로그 2,119장 전부 공란인데 목록은 장수만 노출 |
| **P11** | 드릴다운이 매 렌더 substring 추측 | 5절, `render.ts:149` | `drill` 필드는 스키마에 있으나 미사용. 데이터 늘면 오매칭·비용 증가 |
| **P12** | 문서 stale — `mode` 화면 | 2절 | PROGRESS의 화면 흐름이 실제와 다름 (README에는 화면 흐름 서술 없음 — 2026-07-31 확인) |

### 비문제 확인 기록 (재감사 방지 — 구 IMPROVEMENTS.md에서 이전)

- XSS: 사용자 입력은 `esc()`/`ecEsc()`로 이스케이프됨 — 정상
- `server.py`는 127.0.0.1 바인딩 — 외부 노출 없음
- 전체 innerHTML 리렌더 방식 — 현 규모에서 성능 문제 없음, 이벤트 위임 사용 중
- 카드 edit 시 내장 grammar 보존 — 동작 확인
- `문독.bat` Windows 검증 항목은 **폐기** (2026-07-31 사용자 결정 — Windows 기기 없음, 우선순위 없음)

---

## 8. 확정된 v2 방향 (2026-07-29 결정)

| 축 | 결정 |
|---|---|
| 계정·동기화 | **서버 동기화를 전제로 데이터 모델을 설계**하고, `BackendStore` 구현은 단계적으로 |
| 콘텐츠 공급 | **관리자 큐레이션 카탈로그 + 사용자 비공개 저작**. 사용자 저작물 공개 공유는 범위 밖 |
| 학습기록 | `fail_count` → **리뷰 로그 스키마**로 전환. SRS 알고리즘 도입은 이후 |
| 조직화 | **컬렉션(교재·과목) 1계층 추가** + 태그. 선반은 사용자 개인 정리 수단으로 |

### 3계층 분리 (P1·P2·P3의 공통 해법)

| 계층 | 담는 것 | 소유 | 유실 시 |
|---|---|---|---|
| **Content** | 문헌·카드·주석·컬렉션 | 출처(관리자/카탈로그/사용자) 무관 **단일 모델** | 재설치 가능 |
| **Progress** | 리뷰 로그·streak·마지막 위치 | 사용자 | **복구 불가 — 동기화 대상** |
| **Preference** | 선반 접힘·온보딩·UI 상태 | 사용자 | 무해 |

### 다음 단계

1. ~~as-is 인벤토리~~ ✅ 이 문서
2. **도메인 모델 v2 설계** — 전역 id 체계, `schemaVersion`, 리뷰 로그 스키마, 컬렉션 엔티티, 편집 모델 단일화(텍스트 델타 폐기)
3. **기능명세를 엔티티 기준으로 재작성** — 3절 표의 읽기/쓰기 열을 v2 엔티티 이름으로 교체
4. **스키마 v2 리더 + 1회 마이그레이션 + 백업 v3**
