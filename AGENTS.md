<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# 한문문헌공부 (Hanja-Crusher MVP)

## Purpose
한의학 한문 강제 암기용 로컬 웹 앱 프로젝트. 단일 HTML 파일로 동작하며 백엔드 없이 브라우저 localStorage만을 활용한다. 아는 것을 빠르게 소거하고 모르는 것을 실시간 대기열로 강제 반복 학습시키는 방식으로 설계되었다.

## Key Files

| File | Description |
|------|-------------|
| `요구사양서.md` | 앱 전체 사양서 — 기술 스택, UI/UX 규칙, 대기열 알고리즘, 내장 데이터셋 포함 |

## For AI Agents

### Working In This Directory
- 구현물은 **단일 HTML 파일** 한 장으로 완성해야 한다 (`index.html` 또는 유사 이름).
- 외부 JS/CSS 파일 분리 금지. Tailwind CSS는 CDN 링크로만 로드.
- 백엔드·서버·빌드 툴 도입 불가. 브라우저에서 직접 열면 바로 동작해야 한다.
- 데이터셋(`initialCards`)은 JS 소스 내에 하드코딩된 배열로 삽입.
- 진척도·오답 횟수는 `localStorage`에 저장하고 세션 간 유지.

### Key Algorithms
- **대기열 알고리즘 (studyQueue)**
  - `어려움(1)`: `fail_count` +1 후 다음 위치 직후 `[1]~[3]` 중 랜덤 재삽입 (`splice`)
  - `보통(2)`: 큐 정중앙 인덱스(`Math.floor(length/2)`)에 재삽입
  - `쉬움(3)`: 큐에서 완전 제거(소거)
  - `studyQueue.length === 0` → 세션 종료 → 결과 리포트 출력

### Key Bindings
| Key | Action |
|-----|--------|
| `Space` | Front View → Back View (Flip) |
| `1` | 어려움 처리 후 다음 카드 |
| `2` | 보통 처리 후 다음 카드 |
| `3` | 쉬움 처리 후 다음 카드 |

### Dataset
총 30개 카드:
- `w_01` ~ `w_15` (step 2): 한자 단어 15개 (未病, 攝養, 徒勞 등 한의학 핵심 어휘)
- `s_01` ~ `s_13` (step 3): 한문 문장 13개
- `s_14` ~ `s_15` (step 4): 복합 단락 2개

### Testing Requirements
- 브라우저(Chrome/Safari)에서 HTML 파일을 직접 열어 수동 검증.
- `studyQueue` 알고리즘은 콘솔 로그로 상태 추적 가능하도록 개발 모드 지원 권장.
- localStorage 초기화 기능(리셋 버튼 등)을 제공해 반복 테스트 편의성 확보.

### Common Patterns
- 상태 기반 뷰: `currentView = 'front' | 'back'` 단일 변수로 전환
- 카드 데이터 구조: `{ id, step, front, back, fail_count }`
- `fail_count`는 initialCards에 없으므로 로드 시 `0`으로 초기화

## Dependencies

### External (CDN)
- Tailwind CSS — 유틸리티 CSS 프레임워크 (CDN 로드)

<!-- MANUAL: 추가 메모는 이 줄 아래에 작성하세요 -->
