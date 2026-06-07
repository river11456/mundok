#!/bin/sh
PORT=19234

# LaunchAgent가 서버를 관리하므로 여기서는 브라우저만 열기
# 서버가 아직 시작 중이면 최대 6초 대기
for i in $(seq 1 20); do
  curl -sf "http://localhost:$PORT/api/version" > /dev/null 2>&1 && break
  sleep 0.3
done

open "http://localhost:$PORT"
