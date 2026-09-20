# 文讀 — 현재 인계

> 확인 날짜: **2026-09-20**. 공식 작업 상태는 [GitHub Issues](https://github.com/river11456/mundok/issues), 출시 근거는 [GitHub Releases](https://github.com/river11456/mundok/releases)다. 이 문서는 다음 작업자를 위한 짧은 안내다.

## 운영 기준

- 서비스: [문독](https://river11456.github.io/mundok/)
- 운영 버전·제품 커밋·배포 실행·산출물은 [최신 Release](https://github.com/river11456/mundok/releases/latest)에서 확인한다. [운영 배포 식별 정보](https://river11456.github.io/mundok/release.json)의 버전·커밋과 일치해야 한다.
- 문서 전용 작업은 새 제품을 배포하지 않는다. 문서가 앱 빌드에 섞이는 문제를 해결한 #14는 스타일 입력 경계의 제품 변경이므로 **2.4.1 패치 출시**로 검증한다. 결과와 미검증 사항은 이슈에 기록한다.
- 실제 기기에서의 업데이트·오프라인 재접속·사용자 백업 복원 검증은 별도 [#5](https://github.com/river11456/mundok/issues/5)에서 근거를 확보한다.

## 현재 우선순위와 남은 범위

- 현재 작업은 [#5 백업·복원·기존 사용자 업데이트 검증](https://github.com/river11456/mundok/issues/5)이다. 합성 표본·자동 검사는 `test/backup-recovery.test.mjs`, 반복 실행·복구 절차는 [docs/recovery.md](docs/recovery.md)에 있다. 실제 기기 미검증 항목과 실행 근거는 #5에서 확인한다.
- #5에서 재현된 저장 실패·입력 검증·구 데이터 혼입 결함은 #16·#17·#18로 분리했다. 테스트 통과가 복원 안전성을 뜻하지 않는다.
- [#14 문서 최신화·불필요 자료 제거](https://github.com/river11456/mundok/issues/14)는 완료됐다.
- 작업 절차는 [PROCESS.md](PROCESS.md). [#2](https://github.com/river11456/mundok/issues/2)에서 PR 필수 검사·버전 검사·출시 기록 연결을 적용했다.
- 주요 문서 정비 범위와 완료 근거는 [#3](https://github.com/river11456/mundok/issues/3). 현재 기능은 [SPEC.md](SPEC.md), UI 기준은 [DESIGN.md](DESIGN.md), 서비스화 단계는 [ROADMAP.md](ROADMAP.md)에서 확인한다.
- 폴더 데이터는 임의 깊이를 표현하지만 **생성 UI에는 2단계 제한이 남아 있다**. 합의된 중첩 목표를 구현하는 작업은 [#4](https://github.com/river11456/mundok/issues/4)다.
- 카탈로그는 82문헌이다. 문헌 보강·검수는 [#6](https://github.com/river11456/mundok/issues/6), 새 기능 후보는 로드맵의 이슈 링크로 확인한다.
- 구 문헌 8개 정적 import는 마이그레이션·구 백업 가져오기·오프라인 스타터가 사용하는 카탈로그 정본이다. 제거할 미완료 작업으로 간주하지 않는다.

## 개발·기록

`npm run dev`로 실행한다. 기본 검증은 `npm run lint`, `npm test`, `npm run build`다. 기존 문헌의 드릴다운 매칭·폰트 폴백 경고는 콘텐츠 검수에서 별도로 다룬다.

과거 세션은 [Git 이력](https://github.com/river11456/mundok/blob/b1c50083f414d0ad791137cf32642101a34f2b1a/PROGRESS-archive.md)에서 조회한다. 작업 폴더에는 과거 로그 사본을 계속 쌓지 않는다. 과거 로그의 테스트 수·미배포·로컬 서버·일정 표시는 당시 기록이며 현재 상태의 근거로 사용하지 않는다.
