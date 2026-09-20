# 文讀 디자인 토큰

현재 구현의 색·서체·공통 형태를 정리한다. 토큰 값은 [src/style.css](../src/style.css), 서체 선언은 [index.html](../index.html)이 기준이다. 화면 구조와 상호작용은 [DESIGN.md](../DESIGN.md)를 참고한다.

## 색

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--bg` | `#F4F4F6` | 앱 바탕 |
| `--surface` | `#FFFFFF` | 카드·타일·버튼 표면 |
| `--ink` | `#1D1D1F` | 본문·필수 정보 |
| `--sub` | `#6E7075` | 독음·보조 텍스트 |
| `--faint` | `#AEB0B6` | 장식·힌트용, 필수 정보에는 사용하지 않는 것이 기준 |
| `--line` | `rgba(0,0,0,.08)` | 테두리 |
| `--line-soft` | `rgba(0,0,0,.05)` | 약한 테두리·구분선 |
| `--accent` | `#2E7CF6` | 비텍스트 활성 표시·진행률·포커스 링 |
| `--accent-deep` | `#1D66DB` | 주 버튼 배경·액센트 텍스트 |
| `--accent-deeper` | `#1857BC` | 주 버튼 호버 |
| `--fail` | `#D70015` | 오답·삭제 |
| `--warn` | `#B25000` | 경고·안키 보통 평가 |
| `--shadow` | `0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)` | 기본 그림자 |

문법 주석은 색과 S/V/O 레이블을 함께 사용한다.

| 역할 | 전경 토큰·값 | 배경 토큰·값 |
| --- | --- | --- |
| S | `--s-fg: #D70015` | `--s-bg: rgba(255,59,48,.09)` |
| V | `--v-fg: #0040DD` | `--v-bg: rgba(0,122,255,.10)` |
| O | `--o-fg: #1D7A33` | `--o-bg: rgba(52,199,89,.13)` |

표지색은 문헌의 `color`를 우선하며, 없으면 [src/docs.ts](../src/docs.ts)의 팔레트를 순환 배정한다:
`#F8E3D1` · `#E3EDD9` · `#F7ECCF` · `#DCE8F2` · `#E8E0F0` · `#F6DFDD` · `#EDEAE3` · `#E0EDEA`.

## 서체

- **UI·한글 기본 스택:** `Pretendard Variable → Pretendard → Noto Sans KR → Noto Sans TC → Noto Sans SC → -apple-system → Apple SD Gothic Neo → sans-serif`.
- **한자 `.hanja`·`.kai` 스택:** `LXGW WenKai TC → LXGW WenKai → Noto Serif TC → Pretendard Variable → Pretendard → Noto Sans KR → Noto Sans TC → Noto Sans SC → sans-serif`.
- WenKai는 워드마크·표지·대형 한자뿐 아니라 **단어·문장·단락의 학습 본문에도 적용**한다. Noto Serif TC는 WenKai에 없는 글자를 위한 명조 폴백으로 실제 사용한다.
- 자체 제공하는 WenKai TC는 Regular 400 서브셋이다. 한자 본문은 400을 유지해 합성 굵기를 피한다. 문장은 `clamp(20px, 3.4vw, 27px)`, 단락은 `clamp(17px, 2.8vw, 21px)`, 대형 한자는 `clamp(84px, 16vw, 124px)`를 사용한다.
- 숫자 정렬에는 `.num`의 `font-variant-numeric: tabular-nums`를 사용한다.

### 폰트 생성과 오프라인

[폰트 생성 스크립트](../scripts/subset-font.mjs)는 카탈로그 카드 본문·제목·부제·워드마크의 한자를 수집해 `public/fonts/wenkai-tc-sub.woff2`와 포함 글자 목록을 만든다. 원본 WenKai에 없는 글자는 별도 `missing.txt`에 기록한다. 새 콘텐츠 추가 후 `npm run lint`가 서브셋 누락을 경고하면 `npm run font:subset`으로 갱신한다. 원본 자체에 없는 글자는 재생성으로 해결되지 않으며 폴백을 확인해야 한다. 사용자가 추가한 모든 글자를 번들 서브셋이 포함하는 것은 아니다.

[서비스 워커](../public/sw.js)는 같은 출처의 WenKai 파일을 앱 셸 캐시에, Google Fonts·jsDelivr 응답을 별도 폰트 캐시에 저장한다. 자체 폰트와 CDN 폰트 모두 **성공적으로 요청·캐시된 뒤** 오프라인에서 재사용할 수 있다. 최초 설치의 필수 캐시 목록에는 폰트가 없으므로 모든 글꼴의 오프라인 사용을 보장하지 않는다. 실제 기기에서 글리프·갱신·오프라인 표시를 확인하는 절차는 [PROCESS.md](../PROCESS.md)를 따른다.

## 형태와 모션

- 학습 카드 라운드 24px, 히어로·테이블 카드 20px, 통계 타일 18px. 주 버튼과 칩은 알약 형태를 사용한다.
- 책 표지는 `3 / 4.1` 비율과 `6px 12px 12px 6px` 라운드가 기본이며, 축소 표지는 별도 크기를 사용한다. 표지·폴더·문헌 상세 화면의 배치와 동작은 DESIGN.md를 따른다.
- `--spring: cubic-bezier(.34,1.56,.64,1)`을 호버 전환에 사용한다. 진행률 바는 높이 5px, 채움 전환은 `.3s`다.
- `prefers-reduced-motion: reduce`에서는 전역 애니메이션·전환 시간을 줄인다. 키보드 포커스는 `--accent` 외곽선으로 표시한다.

## 스타일 생성 범위

Tailwind 유틸리티 탐색은 `src/style.css`에서 자동 탐색을 끄고 `src/**/*.ts`와 루트 `index.html`만 지정한다. 설명 문서·테스트·시각 참고 HTML은 스타일 생성 입력이 아니다. 앱 템플릿을 새 언어·경로로 추가할 때는 해당 소스 지정도 함께 변경하고 제품 PR로 검증한다.
