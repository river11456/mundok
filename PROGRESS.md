# 文讀 — 현재 인계

> 확인 날짜: **2026-09-20**. 공식 작업 상태는 [GitHub Issues](https://github.com/river11456/mundok/issues), 출시 근거는 [GitHub Releases](https://github.com/river11456/mundok/releases)다. 이 문서는 다음 작업자를 위한 짧은 안내다.

## 운영 기준

- 서비스: [문독](https://river11456.github.io/mundok/)
- 확인한 운영 버전: **2.4.0** — [출시 기록과 배포 산출물](https://github.com/river11456/mundok/releases/tag/v2.4.0)
- 제품 커밋: `67ab8551a3f17f34e9a44d0f47966579e8dd5b74`
- [배포 실행](https://github.com/river11456/mundok/actions/runs/35509236251): 빌드·테스트·배포·운영 HTML/서비스 워커의 해시 및 버전·커밋 확인 성공. 문서 변경 후에도 같은 제품 배포를 유지한다.
- 자동 테스트 174개 통과. 실제 기기에서의 업데이트·오프라인 재접속·사용자 백업 복원 검증은 별도 [#5](https://github.com/river11456/mundok/issues/5)에서 근거를 확보한다.

## 이어서 볼 것

- 작업 절차는 [PROCESS.md](PROCESS.md). [#2](https://github.com/river11456/mundok/issues/2)에서 PR 필수 검사·버전 검사·출시 기록 연결을 적용했다.
- 문서 정비 범위와 완료 근거는 [#3](https://github.com/river11456/mundok/issues/3). 현재 기능은 [SPEC.md](SPEC.md), UI 기준은 [DESIGN.md](DESIGN.md), 서비스화 단계는 [ROADMAP.md](ROADMAP.md)에서 확인한다.
- 폴더 데이터는 임의 깊이를 표현하지만 **생성 UI에는 2단계 제한이 남아 있다**. 합의된 중첩 목표를 구현하는 작업은 [#4](https://github.com/river11456/mundok/issues/4)다.
- 카탈로그는 82문헌이다. 문헌 보강·검수는 [#6](https://github.com/river11456/mundok/issues/6), 새 기능 후보는 로드맵의 이슈 링크로 확인한다.
- 구 문헌 8개 정적 import는 마이그레이션·구 백업 가져오기·오프라인 스타터가 사용하는 카탈로그 정본이다. 제거할 미완료 작업으로 간주하지 않는다.

## 개발·기록

`npm run dev`로 실행한다. 기본 검증은 `npm run lint`, `npm test`, `npm run build`다. 기존 문헌의 드릴다운 매칭·폰트 폴백 경고는 콘텐츠 검수에서 별도로 다룬다.

과거 세션은 [PROGRESS-archive.md](PROGRESS-archive.md)에 보존했다. 과거 로그의 테스트 수·미배포·로컬 서버·일정 표시는 당시 기록이며 현재 상태의 근거로 사용하지 않는다.
