# Design

> UI·상호작용 기준 문서다. **2026-11-03, 4.0.0 출시 준비 코드**의 문장 블록·현토 통합을 반영했으며 배포 완료를 뜻하지 않는다. 현행 기능·데이터 계약은 [SPEC.md](SPEC.md), 작업 상태는 [GitHub Issues](https://github.com/river11456/mundok/issues), 검증·변경 절차는 [PROCESS.md](PROCESS.md)를 따른다.
> 아래 원칙과 접근성·반응형·오류 상태 요구는 구현·리뷰 기준이며, 모든 대상 기기의 검증 완료 선언이 아니다. 실제 기기·PWA·복원 근거는 [#5](https://github.com/river11456/mundok/issues/5)에서 확보한다.

## Current implementation and follow-up

| 구분 | 현재 상태 | 목표·검증 경계 |
| --- | --- | --- |
| 폴더 라이브러리 | 폴더 진입·breadcrumbs·생성·이름변경·삭제·문헌 이동 구현 | 모델은 임의 깊이, 생성 UI는 2단계 제한. 합의된 중첩 목표는 [#4](https://github.com/river11456/mundok/issues/4) |
| 문장 학습 편집기 | 큰 학습 모달, 한자별 독음·부분 입력·붙여넣기·빈칸 자동 입력·해석·메모 구현 | 폰에서는 전체 높이 시트. 기기·IME 실제 사용 검증은 #5 |
| 작성 중 초안 | 기존 카드 수정의 임시 저장 상태·홈 이어쓰기·파일 보관·확인 후 버리기 | 정식 반영은 저장 버튼. 카드 추가·문헌 생성·본문 추가·정보 수정은 후속 범위([#26](https://github.com/river11456/mundok/issues/26)) |
| 한자 도움 | 내장 사전의 대표·대체 후보, 빈 값 보강, 기존 값 보존, Daum 확인 링크 구현 | 사전 제안이 정답 보증은 아니며 수동 입력·확인을 유지 |
| 꾸미기·탐색 확장 | color/icon은 예약 필드, 사용자 편집 UI 없음 | 검색·목록 보기와 함께 [#9](https://github.com/river11456/mundok/issues/9) 후보 |
| 본문·문장 복습 | 문장 블록 지정·합치기·이동·추가·실행 취소, 문장 클릭 학습과 순차 복습 | 안키 평가·결과 화면 제거. 과거 로그·백업 읽기 유지 |
| 현토 | 원문과 별도 저장, 한자 뒤 입력·후보 확인·표시 전환 | 기존 한글을 자동 확정하지 않음. 본문·문장 화면에서 같은 표시 규칙 적용 |

8/1의 열린 선반·폴더 진입형 기각은 9/3 폴더 라이브러리 전환으로 대체됐다. 현재 제한을 장기 디자인 정책으로 고정하지 않는다.

## Source of truth
- Status: Active
- Last refreshed: 2026-11-03
- Primary product surfaces:
  - Home library and folder navigation
  - Document body and secondary management overlay
  - Shelf/folder creation and move dialogs
  - Sentence learning editor for one card at a time
  - Character add/edit dictionary-assist surfaces
- Evidence reviewed:
  - `package.json`: Vite + TypeScript + Tailwind CSS v4, no React/Vue/Svelte runtime
  - `design/tokens.md`: GoodNotes library grammar, cool neutral chrome, pastel book covers, WenKai display use
  - [과거 시각 참고](design/mockups/final.html): retained as the original visual reference cited by CSS comments; not a current screen specification or shipped page
  - `src/render.ts`: home, study card, sentence-body, reading-cell, and drilldown rendering
  - `src/docs.ts`: `shelvesForHome()` and `homeDocs()` source of display ordering
  - `src/collections.ts`: `parentId` folder tree storage, normalization, and pure collection logic
  - `src/shelf-ui.ts`: shelf create/rename and document move sheets
  - `src/editcard.ts`: large sentence learning modal with per-Han reading cells, interpretation, and note; other card types keep the compact modal
  - `src/storage/drafts.ts` and `src/draft-list.ts`: separate local drafts, home resume/export/discard, preserved malformed records
  - `src/addcard.ts`: character add/enrichment flow with bundled dictionary candidates, blank-only filling, duplicate preservation, and Daum verification link
  - `src/reading-align.ts` and `src/sentence-reading-autofill.ts`: complete/partial reading alignment, paste distribution, and suggestions that preserve entered values
  - `src/style.css`: tokens, modal surfaces, card cells, reading labels, folder library, responsive and focus rules
  - [글자 셀 표시 기준](design/char-cell.md): current R1–R9 rendering and selection contracts
  - `.omx/` material is historical supporting context; current requirements are recorded here and in linked Issues.

## Sentence body and hyeonto (#30)

- Keep the existing cool-gray background, white surfaces, blue actions, WenKai Han text, and library navigation. No separate sidebar or new visual identity.
- Show the document as a continuous readable body. Block controls stay quiet; selection exposes **문장으로 지정**, and each block opens the existing sentence learning screen.
- Support merge of adjacent selected blocks, handle-based reorder (including keyboard arrows), add, and undo. Do not unfold old annotations under the body; meaning and notes stay on the first fragment after splitting.
- Render confirmed hyeonto and unconfirmed legacy candidates identically on the Han baseline in Pretendard / Noto Sans KR / sans-serif, at **70%** of the Han size, weight **400**, color **#626873**, with restrained inline spacing. Keep Han font and layout unchanged. Candidate styling does not confirm or mutate stored text; explicitly retained original text keeps its original styling.
- Hyeonto editing selects the preceding Han and shows an inline input. Existing Hangul is a reviewable candidate with **원문에 남기기**, not an automatic data migration. Hide/show applies to reading surfaces; range editing keeps all source positions visible.
- Document management remains a secondary action for metadata, export, references, and existing material. Word/character learning remains available as supporting material and drilldown.

## Brand
- Personality: quiet study tool, polished native-library feel, learned but not ornate
- Trust signals: stable document organization, recoverable-feeling movement, clear current location, explicit learning state, no silent overwrite of learner-authored content
- Avoid: file-manager clutter, loud decoration, generic dashboard cards, marketing copy on the app surface, dictionary automation that hides what changed

## Product goals
- Goals:
  - Keep the GoodNotes-like document library with folders and visually recognizable book covers.
  - Preserve existing user collections through migration and keep one canonical document location.
  - Split the product's two uses clearly: the editor is for real-time learning, and flash cards are for comfortable review.
  - Make one sentence card the primary learning unit in the editor.
  - Let a learner inspect unknown Han characters, fill character-card gaps from approved dictionary data, enter sentence reading, and write interpretation without losing sentence context.
- Non-goals:
  - Do not clone GoodNotes visual assets or exact UI.
  - Do not introduce account sync or backend storage in this change.
  - Anki review is removed; preserve historic records without exposing its former rating flow.
  - Keep existing grammar and interpretation-order tools; paragraph-wide editing is outside this change.
  - Do not silently overwrite user-authored reading, meaning, explanation, note, or review data.
  - Do not depend on unsupported scraping of a consumer dictionary page as a production source.
- Success signals:
  - Users can open folders, navigate with breadcrumbs, and move documents without losing content.
  - Existing `mundok-v3/collections` users keep their current shelves as top-level folders.
  - Opening a sentence card presents one uninterrupted learning workspace instead of nested small modals.
  - Selecting a Han character keeps unsaved sentence reading and interpretation work intact.
  - Empty character reading/meaning fields can be suggested or filled from dictionary candidates; existing user values remain unchanged.
  - Sentence reading can be entered progressively per Han character, with partial input shown as normal progress rather than an error.
  - `npm test` and `npm run build` pass after implementation.

## Personas and jobs
- Primary personas:
  - 한의학 한문 학습자 managing course texts, reference excerpts, and self-created notes
  - Sentence-level learners who study one phrase or sentence deeply before reviewing it later
- User jobs:
  - Quickly resume study from a document library.
  - Browse by class, topic, source text, or reference folder.
  - Select an unknown character in a sentence and confirm its sound/meaning without switching context.
  - Enter all sentence readings efficiently after character meanings are known.
  - Write a complete interpretation in a comfortable surface.
  - Review already prepared cards later without redoing learning work.
- Key contexts of use: desktop browsing, iPad/PWA touch, phone reference checks, Korean IME input, short study sessions, offline-capable local storage

## Information architecture
- Primary navigation:
  - Home library at root folder
  - Folder drill-in with breadcrumbs for ancestors
  - Document body and secondary management overlay for a selected document
  - Study/review routes remain distinct from the learning editor
- Core routes/screens:
  - `home`, `document`, `level`, and `study` are the main screens.
  - Folder path is home-state, not a new screen type unless implementation evidence proves otherwise.
  - Sentence editing uses a large modal and a full-height sheet at the phone breakpoint. Keep sentence context available during character lookup, reading entry, and interpretation writing.
- Content hierarchy:
  - Library root -> folder -> optional subfolder -> documents -> full body -> sentence learning/review
  - Sentence learning workspace -> original sentence -> character investigation -> per-character reading -> interpretation/explanation -> existing card fields
  - Existing deeper imported folder data remains representable and navigable. Current creation entry points limit depth to 2; removing that UI limit to match the agreed nesting goal is tracked in [#4](https://github.com/river11456/mundok/issues/4).

## Design principles
- Principle 1: Location before grouping. A folder is a place the user is currently inside, not a collapsible section on the same page.
- Principle 2: Covers remain the learning objects. Folders organize; documents keep the strongest visual presence.
- Principle 3: Creation has one doorway. Folder, document, and catalog acquisition begin from one contextual Add control instead of competing grid tiles.
- Principle 4: The editor is a learning desk, not an admin form. The sentence stays visible while the user investigates characters, enters readings, and writes interpretation.
- Principle 5: Suggestions are provisional. Dictionary values help fill blanks, but the learner or existing user data stays authoritative.
- Principle 6: Partial reading is progress. Missing cells, accepted suggestions, and overflow/unmapped input should be legible without treating normal typing as failure.
- Principle 7: Reading has one surface. Sentence cards show only the per-Han reading cells; bulk entry happens inside that surface by pasting into cells or asking local card/dictionary data to fill blank cells, rather than exposing a duplicate full-reading field.
- Principle 8: The document body is the primary learning launch point. Keep sentence selection and review visible; references, export, and destructive actions belong in the secondary document management overlay.
- Tradeoffs:
  - GoodNotes-like nested folders add data migration and move-dialog complexity; Document drag/drop now complements click/tap movement; folder dragging remains out of scope.
  - Per-character reading cells are heavier than a single reading input, so preserve full-reading paste and bulk suggestion acceptance to keep batch entry fast.
  - Local-first static PWA constraints favor bundled or locally cached dictionary data plus external verification links over secret-bearing APIs.

## Visual language
- Color:
  - Reuse existing neutral chrome, document pastel palette, and folder colors derived from cover colors.
  - Use `--accent` only for non-text accents, active state, progress, and focus rings; use `--accent-deep` for accessible action text and filled buttons.
  - Dictionary suggestions should use restrained pale surfaces and clear borders, not high-chroma success colors that imply automatic correctness.
- Typography:
  - Keep the existing UI stack and WenKai for wordmark, covers, and Han display.
  - Do not introduce a new font family for this refresh; preserve WenKai's single-weight behavior and avoid fake bold on Han text.
- Spacing/layout rhythm:
  - Home can keep the current narrow library feel around `max-width: 760px`.
  - The sentence learning editor uses a larger workspace than compact add/edit modals for other card types.
  - Character, reading, and interpretation areas should breathe like a study surface, not stack like a settings form.
- Shape/radius/elevation:
  - Keep cover radius, 18-24px modal surfaces, soft border lines, and the existing shadow scale.
  - Folder buttons use the whole tabbed folder silhouette as the interactive surface.
  - Editor internal panels may use low-contrast borders and compact radius; avoid card-inside-card nesting.
- Motion:
  - Folder open/back uses restrained pop/fade or slide.
  - Dictionary candidate reveal and reading-cell state changes should be quick and low-motion.
  - Respect existing `prefers-reduced-motion`.
- Imagery/iconography:
  - Use CSS-rendered folder silhouettes and existing text/icon idioms.
  - Do not add an icon dependency for this phase.

## Components
- Existing components to reuse:
  - Document cover grid and labels in `src/render.ts`
  - Modal surface/backdrop and picker row styles in `src/style.css`
  - Existing shelf name modal and picker interaction pattern in `src/shelf-ui.ts`
  - Character-cell rendering concepts: `.cc`, `.cc-rd`, `.cc-rd-e`, `.drill`, and sentence body scale
  - Existing add/edit storage contracts in `src/addcard.ts`, `src/editcard.ts`, `src/storage/*`, and `src/types.ts`
- New/changed components:
  - Folder-shaped tile whose full silhouette is the open target
  - Breadcrumb bar for root and nested folder locations
  - Continuous document body with quiet block controls and a secondary management overlay
  - Library toolbar with one Add button and an anchored three-action menu: New Folder, New Document, Get Document
  - Move destination sheet that shows nested paths
  - Folder actions for rename and content-preserving delete
  - Sentence learning workspace for one sentence card
  - In-context character inspector opened by selecting one Han character
  - Dictionary candidate panel for reading/meaning suggestions
  - Per-Han reading grid with the Han character in small type and its editable reading directly below
  - Reading auto-fill control inside the per-Han grid header; it fills blank cells only, preserves typed cells, and marks multi-candidate dictionary suggestions for review
  - Larger interpretation/explanation writing surface
- Variants and states:
  - Folder: normal, hover/focus, empty, selected. Custom color/icon UI is a #9 candidate
  - Add menu: closed, open, keyboard-focused, folder action disabled at the depth limit
  - Library: root, nested folder, empty folder
  - Move sheet: current location and create-folder-in-destination
  - Character inspector: known complete card, existing incomplete card, new character, no dictionary result, offline/provider error
  - Dictionary candidate: representative default, alternative candidate, selected, applied, rejected, manual override
  - Reading cell: blank, focused, composing with Korean IME, suggestion, confirmed, edited, accepted, missing, excess/unmapped paste
  - Interpretation: empty, dirty, saved, validation error
- Token/component ownership:
  - Keep styles in `src/style.css`.
  - Keep pure collection mutations in `src/collections.ts`.
  - Keep home view data shaping in `src/docs.ts`.
  - Keep dictionary lookup/merge rules outside UI rendering so non-overwrite behavior can be unit tested.
  - Keep sentence reading draft state separate from persisted `Card.reading` until save.

## Accessibility
- Target standard: practical WCAG AA for readable text and keyboard/touch operation
- Keyboard/focus behavior:
  - Breadcrumbs, folder tiles, document tiles, toolbar buttons, dialogs, move destinations, character inspector controls, candidate choices, and reading cells must be reachable with visible focus.
  - Reading cells need efficient arrow/tab movement without breaking Korean IME composition.
  - Escape, backdrop click, and 닫기 in the card editor preserve the draft before closing; failed preservation keeps the editor open. 초안 버리기 requires explicit confirmation.
- Contrast/readability:
  - Do not use `--faint` for required folder, document, character, reading, or candidate text.
  - Suggestions may be visually lighter than confirmed values, but must remain readable.
- Screen-reader semantics:
  - Folder tiles expose item type, name, count, and open action.
  - Dialogs use `role="dialog"` and existing modal pattern.
  - Character inspector identifies the selected Han character, existing-card status, and whether candidate values are suggestions or applied values.
  - Reading cells expose the Han character they belong to and current state.
- Reduced motion and sensory considerations:
  - Reuse global reduced-motion rule.
  - Avoid layout-shifting folder or reading-cell animations.

## Responsive behavior
- Supported breakpoints/devices: desktop, tablet/PWA, phone at existing `480px` breakpoint
- Layout adaptations:
  - Desktop grid can show folders and covers together.
  - Desktop editor should keep sentence context, character inspector, reading grid, and interpretation visible with minimal scrolling.
  - Tablet editor may stack inspector and writing surface while keeping the sentence pinned or quickly reachable.
  - Phone editor uses one compact vertical flow with large touch targets and no hover-only management actions.
- Touch/hover differences:
  - Destructive and management actions must be discoverable on touch, not hover-only.
  - Character selection and candidate selection must not rely on drag precision.
  - Reading-cell controls need 44px-class hit areas where practical.

## Interaction states
- Loading:
  - Local-only collection operations are synchronous; no spinner needed.
  - Dictionary lookup should show a small inline pending state in the character inspector, not block the whole editor.
- Empty:
  - Root or folder with no content keeps the single Add control visible; the empty message does not duplicate creation tiles.
  - Empty character reading/meaning fields should be visibly eligible for suggestions.
  - Empty interpretation should present a comfortable writing surface, not a tiny placeholder-only field.
- Error:
  - Malformed old collection data should be filtered or migrated conservatively.
  - Dictionary parse, no-result, provider-error, or offline states must keep manual input and external verification available.
  - Partial reading entry is not an error; only save-blocking invalid states should be styled as errors.
- Success:
  - Folder/document moves should close the sheet and re-render at the affected location.
  - Applying a dictionary suggestion fills only blank fields and marks the result as user-reviewable before save.
  - Saving the editor updates the existing card fields consumed by review.
- Disabled:
  - Moving a folder into itself or descendants must be blocked.
  - Current UI: at depth 2 the Add menu's New Folder row is disabled while New Document and Get Document remain available. This is a known implementation limit to resolve in #4, not the target nesting policy.
  - Candidate apply actions are disabled only when there is nothing eligible to fill; manual input remains enabled.
- Offline/slow network, if applicable:
  - Folder UI works offline from localStorage.
  - Bundled/local dictionary suggestions should work offline when available.
  - Daum or other external dictionary links are verification fallbacks, not required for saving.

## Content voice
- Tone: short Korean labels, app-surface commands only, calm learning language
- Terminology:
  - Rename user-facing "선반" to "폴더" for the new IA; code can migrate gradually if compatibility requires.
  - Use "문장", "한자", "독음", "뜻", "해석", and "설명" consistently.
  - Prefer "제안" for dictionary-filled values until the learner applies or edits them.
- Microcopy rules:
  - Avoid explanatory paragraphs inside the library.
  - Put guidance only in empty states, dialogs, and inline states where the next action is otherwise ambiguous.
  - Candidate copy should be transparent: "빈 칸만 채움", "기존 값 유지", and "다음에서 확인" are acceptable short labels.

## Card draft interaction contract

- Existing card editing preserves raw text, reading cells, overflow, unresolved paste, and Korean IME input locally; restoring must retain the existing reading validation requirements.
- Show `이 기기에 임시 저장됨` only after a successful write. Keep `저장` as the explicit action that applies changes to the card, and use `닫기` for leaving a preserved draft.
- Home lists `작성 중인 내용` across documents with last-edited time and `이어쓰기`, `파일로 보관`, and `초안 버리기`. Drafts remain in this browser and are excluded from the full backup; say so beside the actions.
- Storage failure keeps the current input visible with a persistent error, retry, and file export. Do not imply that closing or an app lifecycle event guarantees preservation when storage failed.
- If the stored card differs from the draft baseline, freeze editing and final save until the learner reviews the current card and explicitly chooses to continue with the draft. Missing targets and unreadable drafts retain export/discard access without automatic recreation or overwrite.
- File export preserves draft JSON for recovery; no draft-file import flow exists. Adding cards and creating/appending/editing document metadata remain follow-up work. Actual mobile/PWA recovery evidence belongs in #5.

## Dictionary Assist Contract
- Trigger: selecting a single Han character in the sentence learning editor or character-add flow may open dictionary assistance.
- Data behavior:
  - If the target card already exists and is complete, show its current reading/meaning and do not modify it.
  - If the target card exists but reading or meaning is empty, enrich that card rather than creating a duplicate.
  - If the target card does not exist, prepare a new character card draft.
  - Dictionary suggestions may prefill or apply only empty fields.
  - User-authored values are never overwritten automatically.
- Candidate behavior:
  - Show one representative candidate first.
  - Preserve and expose alternative candidates when multiple readings/meanings exist.
  - The user can select another candidate before applying.
  - Manual reading and meaning input is always available, including when no candidate exists.
- External verification:
  - Provide a Daum Hanja dictionary search link for the selected character as an external confirmation path.
  - The external link is a user-initiated verification action, not an embedded scrape or required dependency.
- Review compatibility:
  - Saving dictionary-assisted changes must produce the same character card fields consumed by existing review.
  - The editor may hold draft/suggestion state internally, but persisted data must remain compatible unless a separate migration is approved.

## Implementation constraints
- Framework/styling system: Vite + TypeScript + Tailwind CSS v4 import, direct DOM/string rendering; no component framework
- Design-token constraints:
  - Keep `design/tokens.md` as visual baseline.
  - Update it only if new editor or folder tokens become canonical.
  - Do not introduce a separate design-system layer.
- Performance constraints:
  - Data stays local and bounded; the generated Hanja dictionary is about 1.3 MB and should be loaded once, then cached.
  - Tree helpers should be pure and avoid repeated full scans in render hot paths.
  - Dictionary lookup should be synchronous or cheaply cached when backed by bundled data.
  - Reading-cell updates should not re-render the whole study screen on every IME composition step.
- Compatibility constraints:
  - Migrate `mundok-v3/collections` one-level shelves to a folder tree without losing doc order.
  - Backup v3 includes normalized folder trees; old backups without collections are reseeded and older v2/userdata imports use migration. Actual-device recovery verification remains #5.
  - Existing `Card.reading`, `Card.back`, and review rendering remain canonical until a migration is explicitly approved.
  - The first editor pass must not break current grammar or interpretation-order behavior.
- Test/screenshot expectations:
  - Collection tree unit tests and migration tests for library changes.
  - Dictionary merge tests for blank-only filling, existing complete card preservation, incomplete-card enrichment, duplicate avoidance, and multiple candidates.
  - Reading editor tests for partial alignment, suggestion/confirmation state, full-reading paste distribution, and Korean IME-safe navigation.
  - Regression tests for sentence-block operations, hyeonto coordinates, sequential review, and reading historic Anki data.
  - `npm test`, `npm run build`, and at least desktop/mobile visual smoke after implementation.

## Recorded decisions

These are decisions about scope, not a completed-test checklist. Service audience, support environments, data preservation, and support ownership remain open in [ROADMAP.md](ROADMAP.md).
- [x] First pass reserves folder `color`/`icon` fields only; customization UI is a [#9](https://github.com/river11456/mundok/issues/9) candidate.
- [x] Library search, automatic sorting and list view remain [#9](https://github.com/river11456/mundok/issues/9) candidates. Document drag/drop and manual ordering shipped in v4.1.0 (#33/#34); physical mobile verification remains open.
- [x] Deleting a folder preserves content by promoting its documents and child folders to the deleted folder's parent or root.
- [x] A document created while browsing a folder is automatically placed in that folder.
- [x] Folder visuals use the whole tabbed folder silhouette as the interactive surface; no folder icon inside a generic rectangular card.
- [x] New Folder, New Document, and Get Document share one contextual Add menu in the library toolbar.
- [x] Sentence blocks are the primary authoring unit within the full document body.
- [x] Flash-card review remains the review surface; the editor becomes the learning surface.
- [x] Dictionary assistance fills or suggests only empty fields and never overwrites user-authored values.
- [x] Daum dictionary is an external verification link, not a production scrape dependency.
- [x] Sentence cards use a large responsive learning modal; at the phone breakpoint it becomes a full-height sheet while other card types keep the compact modal.
- [x] Bundled dictionary source is libhangul's pinned `data/hanja/hanja.txt`; source metadata and BSD-3-Clause attribution live in `THIRD_PARTY_NOTICES.md`.

## 문헌 드래그·수동 정렬 (#33)

- 문헌 표지에서 마우스/펜은 8px 이상 이동, 터치는 300ms 길게 누른 뒤 이동한다. 터치가 먼저 움직이면 스크롤에 양보한다. 폴더/상단 경로는 이동 대상이며 문헌들이 자리를 비우며 순서 변경 위치를 보여 준다.
- 잡힌 표지의 옅은 잔상, 따라오는 실제 표지 복제, 은은한 목적지 폴더 강조, 주변 문헌의 실시간 재배치로 현재 동작을 표시한다. 가장자리에서 자동 스크롤하며 새 배치는 저장 성공 후 확정한다.
- Esc·창 비활성화·포인터 취소·화면 전환은 취소한다. 드래그 직후 클릭이 문헌을 열지 않게 차단한다.
- 각 문헌의 ⋯ 메뉴에서 앞/뒤 이동과 폴더 이동을 제공한다. 키보드도 동일한 기능을 사용하며, 순서 변경 후 문헌 표지로 초점을 돌리고 결과를 읽어 준다.
- 폴더 우선 배치와 참고문헌 숨김 규칙을 유지한다. 폴더 자체 드래그·자동 폴더 진입·다중 선택·외부 파일 드롭은 이번 범위에 포함하지 않는다.

## Drag-and-drop feedback (#35)

- Status: Implemented, 2026-11-03, 출시 전 검증 코드. 사용자 확인에 따라 **드래그 중 UI만** 개선했다. 공식 범위는 [#35](https://github.com/river11456/mundok/issues/35).
- 기본 화면의 로고·표지 디자인·그리드·메뉴·안내 문구는 유지한다. 데이터와 입력 제스처 계약도 유지한다.
- 잡기/끌기: 제목 상자 대신 실제 표지 복제, 현재 삽입될 칸은 옅은 잔상으로 표시한다. 복제의 포커스·ID·스크린리더 중복과 포인터 간섭을 제거한다.
- 대상: 폴더/상단 경로는 은은한 강조. 순서 변경 시 영향을 받는 문헌 전체가 제목과 메뉴를 포함해 한 칸씩 이동하며, 줄 경계도 이어서 재배치한다. 드래그 시작 시 원래 칸을 고정해 움직이는 문헌 때문에 목표 위치가 흔들리지 않게 한다. 폴더 위치는 유지한다.
- 놓기/취소: 저장 성공 후 짧은 안착, 취소는 원위치 복귀. 저장 실패·화면 전환에는 성공 연출을 하지 않고 잔여 요소를 정리한다.
- 모션: 주변 문헌 재배치는 180ms, 안착/복귀는 160ms, 움직임 감소 설정에서는 이동 애니메이션 생략.
- 구현: library-drag.ts와 드래그 전용 CSS 중심. geometry/UI 연결은 필요한 최소 범위만 수정한다.
- 검증: 기본 화면 동일성, 잡기·목적지·실시간 재배치·놓기·취소 상태, 여러 줄·자동 스크롤·터치·Esc·저장 실패 회귀. 구현 후 lint/test/build와 독립 리뷰.
