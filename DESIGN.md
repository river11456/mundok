# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-09-03
- Primary product surfaces: Home library, document detail overlay, shelf/folder creation and move dialogs
- Evidence reviewed:
  - `package.json`: Vite + TypeScript + Tailwind CSS v4, no React/Vue/Svelte runtime
  - `design/tokens.md`: GoodNotes library grammar, cool neutral chrome, pastel book covers, WenKai display use
  - `design/mockups/final.html`: current shelf/home visual baseline
  - `src/render.ts`: home screen and shelf rendering
  - `src/docs.ts`: `shelvesForHome()` and `homeDocs()` source of display ordering
  - `src/collections.ts`: `parentId` folder tree storage, normalization, and pure collection logic
  - `src/shelf-ui.ts`: shelf create/rename and document move sheets
  - `src/style.css`: home, shelf, cover, modal, touch target, responsive rules
  - Goodnotes Support: folders/documents can be created, moved, nested, customized with color/icon, browsed in grid/list, searched, sorted, and moved by drag/drop or move sheet

## Brand
- Personality: quiet study tool, polished native-library feel, learned but not ornate
- Trust signals: stable document organization, recoverable-feeling movement, clear current location, restrained controls
- Avoid: file-manager clutter, loud decoration, generic dashboard cards, marketing copy on the app surface

## Product goals
- Goals:
  - Replace the current flat shelf list with a GoodNotes-like document library using folders and subfolders.
  - Keep documents visually recognizable as book covers.
  - Preserve existing user collections through migration.
  - Keep one canonical document location.
- Non-goals:
  - Do not clone GoodNotes visual assets or exact UI.
  - Do not introduce account sync or backend storage in this change.
  - Do not change study, card editing, catalog, or progress behavior except where navigation needs document lookup.
- Success signals:
  - The storage model can represent arbitrary folder depth, while the first UI limits folder creation to two visible levels for predictable navigation.
  - Users can open folders, navigate back with breadcrumbs, and move documents without losing content.
  - Existing `mundok-v3/collections` users keep their current shelves as top-level folders.
  - `npm test` and `npm run build` pass after implementation.

## Personas and jobs
- Primary personas: 한의학 한문 학습자 managing course texts, reference excerpts, and self-created notes
- User jobs: quickly resume study, browse by class/topic, separate source texts from references, reorganize material as coursework changes
- Key contexts of use: desktop browsing, iPad/PWA touch, short study sessions, offline-capable local storage

## Information architecture
- Primary navigation: Home library at root folder, folder drill-in, breadcrumbs for ancestors, document overlay for a selected document
- Core routes/screens: `home`, `level`, `study` remain; folder path is home-state, not a new screen type unless implementation evidence proves otherwise
- Content hierarchy: Library root -> folder -> optional subfolder -> documents -> document detail overlay -> study modes. Existing deeper imported data remains representable and navigable, but the first UI does not create depth 3+.

## Design principles
- Principle 1: Location before grouping. A folder is a place the user is currently inside, not a collapsible section on the same page.
- Principle 2: Covers remain the learning objects. Folders organize; documents keep the strongest visual presence.
- Principle 3: Creation has one doorway. Folder, document, and catalog acquisition begin from one contextual Add control instead of competing grid tiles.
- Tradeoffs: GoodNotes-like nested folders add data migration and move-dialog complexity; defer drag/drop until click/tap movement is solid.

## Visual language
- Color: reuse existing neutral chrome and document pastel palette; add folder color tokens derived from existing cover colors
- Typography: keep existing UI stack and WenKai only for wordmark/covers; no new font family in this change
- Spacing/layout rhythm: current `max-width: 680px` can remain for narrow library, but folder grid may need a slightly wider cap on desktop after visual QA
- Shape/radius/elevation: keep cover radius and existing 18-24px modal surfaces; the folder button itself uses a recognizable tabbed folder silhouette rather than a generic white card containing a folder icon
- Motion: folder open/back uses restrained pop/fade or slide; respect existing `prefers-reduced-motion`
- Imagery/iconography: use a CSS-rendered folder silhouette with color affordance; do not place a separate folder icon inside the tile or add an icon dependency

## Components
- Existing components to reuse:
  - Document cover grid and labels in `src/render.ts`
  - Modal surface/backdrop and picker row styles in `src/style.css`
  - Existing shelf name modal and picker interaction pattern in `src/shelf-ui.ts`
- New/changed components:
  - Folder-shaped tile whose full silhouette is the open target
  - Breadcrumb bar for root and nested folder locations
  - Library toolbar with one Add button and an anchored three-action menu: New Folder, New Document, Get Document
  - Move destination sheet that shows nested paths
  - Folder actions for rename and content-preserving delete
- Variants and states:
  - Folder: normal, hover/focus, empty, selected, custom color/icon
  - Add menu: closed, open, keyboard-focused, folder action disabled at the depth limit
  - Library: root, nested folder, empty folder
  - Move sheet: current location and create-folder-in-destination
- Token/component ownership: keep styles in `src/style.css`; keep pure collection mutations in `src/collections.ts`; keep home view data shaping in `src/docs.ts`

## Accessibility
- Target standard: practical WCAG AA for readable text and keyboard/touch operation
- Keyboard/focus behavior: breadcrumbs, folder tiles, document tiles, toolbar buttons, dialogs, and move destinations must be reachable with visible focus
- Contrast/readability: do not use `--faint` for required folder/document names
- Screen-reader semantics: folder tiles expose item type, name, count, and open action; dialogs use `role="dialog"` and existing modal pattern
- Reduced motion and sensory considerations: reuse global reduced-motion rule; avoid layout-shifting folder animations

## Responsive behavior
- Supported breakpoints/devices: desktop, tablet/PWA, phone at existing `480px` breakpoint
- Layout adaptations: desktop grid can show folders and covers together; phone uses one compact grid/list with large touch targets
- Touch/hover differences: destructive and management actions must be discoverable on touch, not hover-only

## Interaction states
- Loading: local-only collection operations are synchronous; no spinner needed
- Empty: root or folder with no content keeps the single Add control visible; the empty message does not duplicate creation tiles
- Error: malformed old collection data should be filtered or migrated conservatively
- Success: folder/document moves should close the sheet and re-render at the affected location
- Disabled: moving a folder into itself or descendants must be blocked; at depth 2 only the Add menu's New Folder row is disabled with concise guidance while New Document and Get Document remain available
- Offline/slow network, if applicable: catalog download remains separate; folder UI must work offline from localStorage

## Content voice
- Tone: short Korean labels, app-surface commands only
- Terminology: rename user-facing "선반" to "폴더" for the new IA; code can migrate gradually if compatibility requires
- Microcopy rules: avoid explanatory paragraphs inside the library; put guidance only in empty states and dialogs

## Implementation constraints
- Framework/styling system: Vite + TypeScript + Tailwind CSS v4 import, direct DOM/string rendering; no component framework
- Design-token constraints: keep `design/tokens.md` as visual baseline; update it only if new folder tokens become canonical
- Performance constraints: data stays small/local, but tree helpers should be pure and avoid repeated full scans in render hot paths
- Compatibility constraints: migrate `mundok-v3/collections` one-level shelves to a folder tree without losing doc order; backup import/export must accept the new shape and likely preserve old shape compatibility
- Test/screenshot expectations: collection tree unit tests, migration tests, keyboard/touch smoke checks, `npm test`, `npm run build`, and at least desktop/mobile visual smoke after implementation

## Open questions
- [x] First pass reserves `color`/`icon` fields only; customization UI is deferred.
- [x] Search, sort, list view, and drag/drop are deferred.
- [x] Deleting a folder preserves content by promoting its documents and child folders to the deleted folder's parent (or root).
- [x] A document created while browsing a folder is automatically placed in that folder.
- [x] Folder visuals use the whole tabbed folder silhouette as the interactive surface; no folder icon inside a generic rectangular card.
- [x] New Folder, New Document, and Get Document share one contextual Add menu in the library toolbar.
