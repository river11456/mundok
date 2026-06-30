#!/bin/sh
PORT=19234
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT_FILE="$SCRIPT_DIR/.runport"

# 이미 우리 서버가 떠 있으면 그 포트로 브라우저만 열고 끝 (중복 실행 방지 — 강제 종료 안 함)
if curl -sf "http://localhost:$PORT/api/version" > /dev/null 2>&1; then
  open "http://localhost:$PORT"
  exit 0
fi

rm -f "$PORT_FILE"

# 서버 시작 (백그라운드 — 초기 빌드 포함). 19234가 사용 중이면 server.py가 빈 포트로 폴백.
python3 "$SCRIPT_DIR/server.py" &
SERVER_PID=$!

# 터미널 창 닫히면 서버도 함께 종료
trap "kill $SERVER_PID 2>/dev/null; rm -f $PORT_FILE" EXIT INT TERM HUP

# server.py가 실제 포트를 기록하고 응답할 때까지 대기 (최대 30초)
ACTUAL_PORT=""
for i in $(seq 1 100); do
  if [ -f "$PORT_FILE" ]; then
    P="$(cat "$PORT_FILE" 2>/dev/null)"
    if [ -n "$P" ] && curl -sf "http://localhost:$P/api/version" > /dev/null 2>&1; then
      ACTUAL_PORT="$P"
      break
    fi
  fi
  sleep 0.3
done

# 브라우저 열기 (포트 파악 실패 시 기본 포트로 시도)
open "http://localhost:${ACTUAL_PORT:-$PORT}"

# 서버가 살아있는 동안 대기
wait $SERVER_PID
