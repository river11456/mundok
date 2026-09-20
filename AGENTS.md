# 文讀 에이전트 작업 안내

- 작업 전에 [PROCESS.md](PROCESS.md)를 읽고 해당 GitHub 이슈의 범위·완료 조건을 확인한다. 기존 이슈를 찾아 중복을 피하고, 작업 상태와 검증 근거를 갱신한다.
- 현행 기능은 [SPEC.md](SPEC.md), UI 기준은 [DESIGN.md](DESIGN.md), 목표는 [ROADMAP.md](ROADMAP.md), 짧은 인계는 [PROGRESS.md](PROGRESS.md)를 참고한다. 문서와 구현이 충돌하면 현재 동작과 목표를 구분해 기록한다.
- 작업 브랜치와 PR을 사용한다. 제품 버전은 출시 PR의 최종 상태에서 한 번 올린다. PR은 `Related #번호`로 연결하며 자동 종료 표현은 쓰지 않는다.
- 다른 작업자의 변경을 덮어쓰지 않는다. 작은 범위로 수정하고 해당 동작 검증, `npm run lint`, `npm test`, `npm run build` 결과를 확인한다. 작성과 분리된 리뷰 근거를 남긴다.
- 미실행 검증은 명시한다. 제품 작업은 배포와 운영 확인, Release 연결 후에만 이슈를 완료로 닫는다. 문서·테스트·CI·관리 도구만의 변경은 배포하지 않는다.
- 공식 진행 상태는 Issues, 출시 기록은 GitHub Releases다. AI 실행 자료를 공식 상태로 대신하지 않는다.
