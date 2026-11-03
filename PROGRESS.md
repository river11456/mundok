# 文讀 — 현재 인계

> 확인 날짜: **2026-11-03**. 공식 작업 상태는 [GitHub Issues](https://github.com/river11456/mundok/issues), 출시 근거는 [GitHub Releases](https://github.com/river11456/mundok/releases)다. 이 문서는 다음 작업자를 위한 짧은 안내다.

## 운영 기준

- 서비스: [문독](https://river11456.github.io/mundok/)
- 운영 버전·제품 커밋·배포 실행·산출물은 [최신 Release](https://github.com/river11456/mundok/releases/latest)에서 확인한다. [운영 배포 식별 정보](https://river11456.github.io/mundok/release.json)의 버전·커밋과 일치해야 한다.
- 문서 전용 작업은 새 제품을 배포하지 않는다. 제품 변경의 실제 출시·운영 확인 결과는 해당 이슈와 Release에 기록한다.
- 실제 기기에서의 업데이트·오프라인 재접속·사용자 백업 복원 검증은 별도 [#5](https://github.com/river11456/mundok/issues/5)에서 근거를 확보한다.

## 현재 우선순위와 남은 범위

- 현재 작업은 [#30 문장 블록·현토 실제 서비스 통합](https://github.com/river11456/mundok/issues/30)의 **4.0.0 출시 준비**다. [목업 #28](https://github.com/river11456/mundok/issues/28)의 본문 편집·문장 학습·현토 분리를 제품 코드에 연결하고 안키 실행·평가 UI를 제거한다. 기존 문헌·필기·단어/글자 드릴다운·구 백업/로그 읽기는 보존한다. 병합·배포·운영 확인·Release 연결의 최신 상태는 이슈를 따른다. 이 문서는 배포 완료를 뜻하지 않는다.
- 문장 분할의 해석·메모는 첫 조각에 유지하며, 현토·범위 주석은 글자에 따라 이동한다. 카탈로그 업데이트는 사용자 문장 배열·삭제 표시를 유지한다. 문장 블록·현토의 선택적 메타데이터는 문헌/백업 v3에 포함한다. 앱 4.0.0은 안키 공개 동작 제거에 따른 버전이며 이전 앱의 새 데이터 편집 호환성을 보장하지 않는다.
- 최종 로컬 자동 검사 345/345와 lint·build를 통과했다. 별도 리뷰에서 동일 본문 문법 주석 분리, 불확실한 독음 변환 차단, 카드 ID 기반 이어하기를 보완하고 재검토를 통과했다. 데스크톱 본문 분할·합치기·추가·마우스/키보드 이동·실행 취소, 현토 저장/재접속, 문장 학습/복습/드릴다운, 390px 레이아웃을 확인했다. CI·운영 확인 근거는 #30에서 갱신한다. 문장 모델 회귀는 `test/sentence-blocks.test.mjs`, 백업 왕복은 기존 복구 테스트에 포함한다.
- 기존 문헌의 미확정 현토도 처음부터 같은 70% 크기·서체·색으로 표시한다. 분할·혼합 병합 후에도 후보 상태를 유지하며 현토 저장 시에만 확정한다.
- [#26 작성 중 입력 보존](https://github.com/river11456/mundok/issues/26)의 기존 카드 초안 보관·충돌 확인·저장 실패 재시도는 유지한다.
- 초안은 `mundok-drafts/v1/*`에 별도로 저장하며 v3 전체 백업에는 포함하지 않는다. 백업 가져오기 뒤에도 유지하고 원본 변경을 확인한다. 카드 추가·문헌 생성·본문 추가·현토·문헌 정보 수정창의 영구 초안 보관은 후속 범위다.
- 초안 단위 검사는 `test/drafts.test.ts`, 실제 편집·실패 주입·새로고침 검사는 `test/browser-draft-recovery.html`이다. 사용자 데이터가 없는 새 로컬 origin에서만 실행하며 실행 결과는 #26에 기록한다.
- [#22 문장 독음 보존](https://github.com/river11456/mundok/issues/22)은 완료됐다. 원문 토·부호와 빈 독음칸 보존, 모호한 배치 선택·초과 입력 유지·한자 변경 확인을 유지한다.
- 독음 단위 검사는 `test/reading-align.test.ts`·`test/reading-editor.test.ts`, 실제 편집·저장·백업 왕복 브라우저 검사는 `test/browser-reading-editor.html`이다. 브라우저 검사는 사용자 데이터가 없는 새 로컬 포트에서만 실행한다.
- [#16](https://github.com/river11456/mundok/issues/16)·[#17](https://github.com/river11456/mundok/issues/17)·[#18](https://github.com/river11456/mundok/issues/18)의 저장 실패 복구·입력 검증·구 데이터 혼입 방지는 3.0.0에 포함됐다. 원본 저널, 내부 형식·좌표 검사, v1/v3 동시 교체, 한 창 편집 잠금을 유지한다.
- 합성 표본·자동 검사는 `test/backup-recovery.test.mjs`·`test/backup-validation.test.mjs`·`test/editing-session.test.mjs`, 로컬 브라우저 검사는 `test/browser-backup-recovery.html`이다. 반복 실행·호환 제한·복구 절차는 [docs/recovery.md](docs/recovery.md)에 있다.
- [#5 백업·복원·기존 사용자 업데이트 검증](https://github.com/river11456/mundok/issues/5)은 실제 iPad/폰 설치형 PWA, 기기 전체 오프라인, 실제 파일 다운로드 후 업로드 왕복이 미검증으로 남는다. 초안의 실제 모바일 IME 입력·앱 전환·종료 후 재실행·BFCache 복귀 확인도 포함한다. 자동 검사나 데스크톱 서버 중지 검사로 대체하지 않는다.
- [#14 문서 최신화·불필요 자료 제거](https://github.com/river11456/mundok/issues/14)는 완료됐다.
- 작업 절차는 [PROCESS.md](PROCESS.md). [#2](https://github.com/river11456/mundok/issues/2)에서 PR 필수 검사·버전 검사·출시 기록 연결을 적용했다.
- 주요 문서 정비 범위와 완료 근거는 [#3](https://github.com/river11456/mundok/issues/3). 현재 기능은 [SPEC.md](SPEC.md), UI 기준은 [DESIGN.md](DESIGN.md), 서비스화 단계는 [ROADMAP.md](ROADMAP.md)에서 확인한다.
- 폴더 데이터는 임의 깊이를 표현하지만 **생성 UI에는 2단계 제한이 남아 있다**. 합의된 중첩 목표를 구현하는 작업은 [#4](https://github.com/river11456/mundok/issues/4)다.
- #24의 3.1.0 콘텐츠 추가 기준 카탈로그는 83문헌이다. 사용자 결정으로 콘텐츠 보강 #6은 할 일에서 제외했다. 앱의 목적은 직접 해석 작성과 복습이며, 후속 작업은 작성·수정 편의, 복습 흐름, 사용자 데이터 보존을 기준으로 판단한다. 새 기능 후보는 로드맵의 이슈 링크로 확인한다.
- 구 문헌 8개 정적 import는 마이그레이션·구 백업 가져오기·오프라인 스타터가 사용하는 카탈로그 정본이다. 제거할 미완료 작업으로 간주하지 않는다.

## 개발·기록

`npm run dev`로 실행한다. 기본 검증은 `npm run lint`, `npm test`, `npm run build`다. 기존 드릴다운 매칭·폰트 폴백 경고는 남아 있다. 해설 보강 과제와 구분해 실제 표시·탐색에 미치는 영향으로 판단한다.

과거 세션은 [Git 이력](https://github.com/river11456/mundok/blob/b1c50083f414d0ad791137cf32642101a34f2b1a/PROGRESS-archive.md)에서 조회한다. 작업 폴더에는 과거 로그 사본을 계속 쌓지 않는다. 과거 로그의 테스트 수·미배포·로컬 서버·일정 표시는 당시 기록이며 현재 상태의 근거로 사용하지 않는다.
