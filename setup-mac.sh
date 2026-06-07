#!/bin/sh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "文讀 맥 설치를 시작합니다..."

# 1. 의존성 설치
echo "[1/3] npm 패키지 설치 중..."
npm install --prefix "$DIR"

# 2. 런처 앱 빌드
echo "[2/3] 문독.app 생성 중..."
osacompile -o "$DIR/문독.app" "$DIR/launcher.applescript"

# 3. Dock에 추가 안내
echo "[3/3] 완료!"
echo ""
echo "✓ 설치 완료!"
echo ""
echo "사용 방법:"
echo "  1. 문독.app을 Dock에 드래그해 추가하세요"
echo "     (Finder에서 $DIR/문독.app)"
echo "  2. 이후엔 Dock 아이콘 클릭만 하면 됩니다"
echo ""

# Finder에서 앱 위치 열기
open "$DIR"
