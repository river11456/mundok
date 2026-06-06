# Hanja-Crusher MVP — 구현 계획

**Status:** pending approval  
**Created:** 2026-06-05  
**Source:** 요구사양서.md

---

## Requirements Summary

단일 HTML 파일로 동작하는 한문 암기 플래시카드 앱.
- 백엔드 없음, Tailwind CSS CDN + Vanilla ES6+
- 키보드 전용 조작 (마우스 완전 배제)
- 3단계 대기열 알고리즘으로 오답 강제 반복
- 30개 내장 카드, localStorage로 진척도 영속화

---

## Acceptance Criteria

- [ ] `index.html` 단일 파일을 브라우저에서 직접 열면 앱이 즉시 동작한다
- [ ] `Space` 키로 Front→Back 전환, `1`/`2`/`3` 키로 난이도 입력이 동작한다
- [ ] 어려움(1) 처리 시 카드가 `[1]~[3]` 중 무작위 위치에 재삽입된다
- [ ] 보통(2) 처리 시 카드가 정중앙 인덱스에 재삽입된다
- [ ] 쉬움(3) 처리 시 카드가 큐에서 완전 제거된다
- [ ] `studyQueue.length === 0` 시 결과 리포트 화면이 표시된다
- [ ] 결과 리포트에 `fail_count` 기준 오답률 순위가 노출된다
- [ ] 새로고침 후 `localStorage`에서 진척도가 복원된다
- [ ] Front View에는 순수 한자만 표시되고 해석이 노출되지 않는다
- [ ] 30개 카드 데이터가 정확하게 파싱되어 내장된다

---

## Implementation Steps

### Step 1 — HTML 골격 및 Tailwind 설정
**File:** `index.html`

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Hanja-Crusher</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-white min-h-screen flex flex-col items-center justify-center">
  <!-- 뷰 컨테이너 -->
  <div id="app"></div>
</body>
</html>
```

### Step 2 — 데이터 레이어

```javascript
const initialCards = [ /* 요구사양서 30개 카드 그대로 삽입 */ ];

function loadState() {
  const saved = localStorage.getItem('hanja-crusher-state');
  if (saved) return JSON.parse(saved);
  return initialCards.map(c => ({ ...c, fail_count: 0 }));
}

function saveState(cards) {
  localStorage.setItem('hanja-crusher-state', JSON.stringify(cards));
}
```

**localStorage 스키마:**
```json
[{ "id": "w_01", "step": 2, "front": "未病", "back": "...", "fail_count": 0 }]
```

### Step 3 — 상태 관리

```javascript
let allCards = loadState();          // 전체 카드 (fail_count 포함)
let studyQueue = [...allCards];      // 현재 세션 대기열
let currentCard = null;              // 현재 카드
let currentView = 'front';           // 'front' | 'back' | 'result'
```

초기화 시 `studyQueue`를 shuffle하여 무작위 순서로 시작.

### Step 4 — 대기열 알고리즘

```javascript
function processAnswer(difficulty) {
  const card = studyQueue.shift();  // 큐에서 꺼내기

  if (difficulty === 1) {
    // 어려움: fail_count +1, [1]~[3] 무작위 재삽입
    card.fail_count++;
    const maxPos = Math.min(3, studyQueue.length);
    const pos = 1 + Math.floor(Math.random() * maxPos);
    studyQueue.splice(pos, 0, card);
  } else if (difficulty === 2) {
    // 보통: 정중앙 재삽입
    const pos = Math.floor(studyQueue.length / 2);
    studyQueue.splice(pos, 0, card);
  }
  // 쉬움(3): 재삽입 없음 (소거)

  // allCards의 fail_count 동기화 후 저장
  const idx = allCards.findIndex(c => c.id === card.id);
  allCards[idx].fail_count = card.fail_count;
  saveState(allCards);
}
```

**Edge case:** 어려움 처리 시 `studyQueue.length < 1`이면 `pos = 0` (맨 앞)에 삽입.

### Step 5 — UI 렌더링

**Front View:**
```
[화면 중앙] 한자 원문 (text-7xl~9xl, font-bold)
[하단]      [Space] 정답 보기
[좌상단]    진척도: 완료 N / 전체 M
```

**Back View:**
```
[화면 중앙] 한자 원문 (유지, 상단)
[중앙]      한글 해석 (text-2xl, text-gray-300)
[하단]      [1] 어려움 | [2] 보통 | [3] 쉬움
```

**Result View:**
```
[제목]  학습 완료!
[표]    오답 순위 (fail_count > 0인 카드, 내림차순)
        | 순위 | 한자 | 해석 | 오답 횟수 |
[버튼]  [R] 다시 시작
```

### Step 6 — 키보드 이벤트 핸들러

```javascript
document.addEventListener('keydown', (e) => {
  if (currentView === 'front' && e.code === 'Space') {
    e.preventDefault();
    currentView = 'back';
    render();
  } else if (currentView === 'back') {
    if (e.key === '1') { processAnswer(1); nextCard(); }
    if (e.key === '2') { processAnswer(2); nextCard(); }
    if (e.key === '3') { processAnswer(3); nextCard(); }
  } else if (currentView === 'result' && e.key === 'r') {
    resetSession();
  }
});
```

### Step 7 — 세션 진행 / 종료 로직

```javascript
function nextCard() {
  if (studyQueue.length === 0) {
    currentView = 'result';
    render();
    return;
  }
  currentCard = studyQueue[0];
  currentView = 'front';
  render();
}

function resetSession() {
  allCards = loadState();
  studyQueue = shuffle([...allCards]);
  nextCard();
}
```

### Step 8 — localStorage 리셋 (개발/테스트용)

결과 화면 또는 진척도 표시 영역에 숨겨진 `[Ctrl+Shift+R]` 단축키로 localStorage 초기화.

---

## File Structure

```
index.html          ← 단일 파일 (전체 구현)
요구사양서.md        ← 기존 사양서 (수정 불필요)
AGENTS.md           ← 기존 문서
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| 어려움 처리 시 큐 길이 0~1일 때 splice 오류 | `pos = Math.max(0, Math.min(pos, studyQueue.length))` 클램프 처리 |
| localStorage 용량 초과 | 30개 카드는 ~5KB로 안전, 별도 처리 불필요 |
| Space 키로 페이지 스크롤 | `e.preventDefault()` 처리 |
| 한자 폰트 미지원 환경 | Tailwind의 기본 시스템 폰트로 충분, CJK 폰트 별도 로드는 선택 사항 |
| Back View에서 실수로 같은 키 반복 입력 | 처리 중 플래그(`processing = true`)로 중복 입력 방지 |

---

## Verification Steps

1. 브라우저에서 `index.html` 직접 열기 — 첫 카드 Front View 확인
2. `Space` → Back View 전환 확인, 한글 해석 노출 확인
3. `1` 입력 → 콘솔에서 `studyQueue` 확인, 카드가 `[1]~[3]` 위치에 삽입됨
4. `3` 입력 반복 → 모든 카드 소거 → 결과 리포트 확인
5. 새로고침 후 `fail_count`가 localStorage에서 복원됨 확인
6. `Ctrl+Shift+R`로 리셋 후 재시작 확인

---

## Implementation Order

1. HTML 골격 + Tailwind CDN 연결 (5분)
2. 데이터셋 삽입 + localStorage 로드/저장 (10분)
3. 상태 관리 + 대기열 알고리즘 (15분)
4. Front/Back View 렌더링 (15분)
5. 키보드 핸들러 (10분)
6. Result View + 오답 순위표 (10분)
7. 엣지케이스 처리 + 테스트 (15분)

**총 예상 시간: ~80분**
