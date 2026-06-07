# 文讀 (문독)

한의학 한문 학습 웹앱

---

## 설치 방법 (macOS)

### 1단계 — Git 설치 확인

터미널을 열고 아래를 입력하세요.

```
git --version
```

버전이 표시되면 이미 설치된 것입니다. 없다면 [git-scm.com](https://git-scm.com/download/mac)에서 다운로드하거나, 터미널에 `xcode-select --install` 을 입력하면 설치됩니다.

### 2단계 — 앱 다운로드

터미널에 아래를 붙여넣고 실행하세요.

```
git clone https://github.com/river11456/mundok.git ~/문독
```

홈 폴더에 `문독` 폴더가 생깁니다.

### 3단계 — 실행

Finder에서 홈 폴더 → `문독` 폴더 → `문독.command`를 더블클릭하세요.

터미널 창이 열리면서 잠시 후 브라우저에 앱이 자동으로 뜹니다.

> **처음 실행 시 보안 경고가 뜨는 경우**
> 시스템 설정 → 개인 정보 보호 및 보안 → 하단 "확인 없이 열기" 클릭

---

## 설치 방법 (Windows)

### 1단계 — 필수 프로그램 설치

아래 프로그램을 설치하세요.

- [Git for Windows](https://git-scm.com/download/win)
- [Python](https://www.python.org/downloads/windows/)
- [Node.js LTS](https://nodejs.org/)

Python 설치 화면에서는 **Add python.exe to PATH**를 체크하는 것을 권장합니다.

### 2단계 — 앱 다운로드

시작 메뉴에서 `명령 프롬프트`를 열고 아래를 실행하세요.

```
git clone https://github.com/river11456/mundok.git %USERPROFILE%\문독
```

Git Bash를 사용하는 경우에는 아래처럼 실행하세요.

```
git clone https://github.com/river11456/mundok.git ~/문독
```

### 3단계 — 실행

파일 탐색기에서 사용자 폴더 → `문독` 폴더 → `문독.bat`를 더블클릭하세요.

명령 프롬프트 창이 열리면서 잠시 후 브라우저에 앱이 자동으로 뜹니다.

## 이후 실행

macOS에서는 `문독.command`, Windows에서는 `문독.bat`를 더블클릭하면 됩니다.

앱을 닫을 때는 함께 열린 터미널 또는 명령 프롬프트 창을 닫으면 서버도 자동으로 종료됩니다.

---

## 업데이트

앱이 업데이트되었을 때, 터미널에서 아래를 실행하세요.

```
cd ~/문독 && git pull
```

Windows 명령 프롬프트에서는 아래를 실행하세요.

```
cd %USERPROFILE%\문독
git pull
```

Git Bash에서는 아래를 실행하세요.

```
cd ~/문독
git pull
```
