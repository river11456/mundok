# 文讀 (문독)

한의학 한문 학습 웹앱

---

## 사용 방법 (일반 사용자)

설치할 것이 없습니다. 아래 주소를 브라우저에서 열기만 하면 됩니다.

> **https://river11456.github.io/mundok/**

휴대폰·태블릿·PC 어디서든 동작합니다. 홈 화면에 추가해 두면 앱처럼 쓸 수 있습니다.

### 내가 추가·수정한 카드는 어디 저장되나요?

학습 진도와 직접 추가·수정한 카드는 **그 브라우저 안에** 저장됩니다. 따라서:

- 다른 기기·다른 브라우저로 접속하면 보이지 않습니다.
- 브라우저 기록을 지우거나, (아이폰 사파리의 경우) 한동안 접속하지 않으면 사라질 수 있습니다.

소중한 내용은 화면 **왼쪽 아래 ⤓ 버튼 → "내 데이터 내보내기"** 로 백업해 두세요.
기기를 바꿀 때는 같은 메뉴의 "가져오기"로 복원할 수 있습니다.

> 문헌은 홈의 **문헌 받기**(카탈로그)에서 내려받거나 직접 만들 수 있습니다. 받은 문헌도 자유롭게 고칠 수 있고, 업데이트가 오면 직접 수정한 카드는 보존됩니다.

---

## 콘텐츠 저작·승격 (관리자)

v2부터 별도 저작 모드가 없습니다 — 관리자도 앱에서는 일반 사용자와 똑같이 저작합니다 (`SPEC.md` 공리 4).

1. **저작**: 앱(배포본 또는 `npm run dev`)에서 문헌을 만들고 카드·문법·해석 순서를 다듬는다.
2. **내보내기**: 문헌 상세 오버레이 → **내보내기** — `<문헌id>.json` 다운로드.
3. **승격**: `node scripts/promote.mjs <내보낸.json>` — 유저 전용 필드 정리 + version 증가 + lint 검사 후 `catalog/<id>.json` 배치.
4. **배포**: `node scripts/lint-data.mjs` 확인 → `git add catalog && git commit && git push` → GitHub Actions가 자동 배포 (약 1~2분).

> **폰트**: 새 문헌에 새 한자가 들어오면 lint가 WARN을 낸다 → `npm run font:subset` 재실행 후 산출물 커밋.
> **원본 PDF**: 문헌 원본 PDF는 git에서 분리해 관리자 로컬 `~/Documents/문독-원본PDF/`에 보관 (2026-07-08).

---

## 배포 구조 (개발자 참고)

- **호스팅**: GitHub Pages (`.github/workflows/deploy.yml` 가 `main` push마다 빌드·배포)
- **콘텐츠 정본**: `catalog/*.json` → 빌드 시 `dist/catalog/`(+`index.json`) 정적 배포. 선반·참고문헌 관계는 `catalog/_collections.json`
- **유저 공간**: 브라우저 `localStorage` `mundok-v3/*` — 문헌(`docs`)·리뷰 로그(`log/<docId>`)·세션·설정. 문헌은 출처(직접 생성/카탈로그) 무관 동등
- **저장 추상화**: `src/storage/` — `LocalStore`가 Content·Progress·Preference 3계층 전담.
  향후 백엔드 동기화가 필요하면 `BackendStore` 하나만 추가하면 됩니다.
- **개발**: `npm run dev` (vite) / 테스트 `npm test` / 빌드 `npm run build` (데이터 lint → tsc → vite)
