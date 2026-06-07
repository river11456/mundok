#!/bin/sh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.mundok.server.plist"
LOG_DIR="$HOME/Library/Logs/mundok"

echo "文讀 맥 설치를 시작합니다..."

# 1. 의존성 설치
echo "[1/4] npm 패키지 설치 중..."
npm install --prefix "$DIR"

# 2. 로그 폴더 생성
mkdir -p "$LOG_DIR"

# 3. LaunchAgent plist 생성 (현재 경로 기준으로 자동 설정)
echo "[2/4] LaunchAgent 등록 중..."
cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mundok.server</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$DIR/server.py</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$DIR</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/server.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/server.error.log</string>
</dict>
</plist>
EOF

# 4. LaunchAgent 로드 (이미 로드된 경우 재시작)
echo "[3/4] 서버 시작 중..."
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

# 서버 응답 대기 (최대 30초)
for i in $(seq 1 100); do
  curl -sf "http://localhost:19234/api/version" > /dev/null 2>&1 && break
  sleep 0.3
done

# 5. Chrome에서 PWA 설치 안내
echo "[4/4] 브라우저를 엽니다..."
open -a "Google Chrome" "http://localhost:19234"

echo ""
echo "✓ 설치 완료!"
echo ""
echo "Chrome 주소창 오른쪽의 ⊕ 설치 버튼을 눌러 앱을 설치하세요."
echo "이후엔 맥북을 켜면 서버가 자동으로 실행됩니다."
