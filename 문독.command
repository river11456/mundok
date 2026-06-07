#!/bin/sh
PORT=19234
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 포트 사용 중이면 종료
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
sleep 0.3

# 서버 시작 (백그라운드 — 초기 빌드 포함)
python3 "$SCRIPT_DIR/server.py" &
SERVER_PID=$!

# 터미널 창 닫히면 서버도 함께 종료
trap "kill $SERVER_PID 2>/dev/null" EXIT INT TERM HUP

# 초기 빌드 완료 후 서버가 뜰 때까지 대기 (최대 30초)
for i in $(seq 1 100); do
  curl -sf "http://localhost:$PORT/api/version" > /dev/null 2>&1 && break
  sleep 0.3
done

# 브라우저 열기
open "http://localhost:$PORT"

# 서버가 살아있는 동안 대기
wait $SERVER_PID
