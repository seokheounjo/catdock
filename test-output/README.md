# Hello World Node.js 프로젝트 🌟

간단하고 친근한 Hello World 메시지를 출력하는 Node.js 스크립트입니다.
프로그래밍을 처음 시작하는 분들에게 완벽한 첫 번째 프로젝트입니다!

## 📋 프로젝트 소개

이 프로젝트는 콘솔에 "Hello World" 메시지를 출력하는 아주 간단한 Node.js 스크립트입니다.
프로그래밍의 전통적인 첫 번째 예제로, 누구나 쉽게 실행하고 이해할 수 있도록 만들어졌습니다.

### ✨ 특징
- 🚀 **초보자 친화적**: 복잡한 설정 없이 바로 실행 가능
- 📦 **경량**: 단 4줄의 코드로 구성
- 🌍 **크로스 플랫폼**: Windows, Mac, Linux에서 모두 동작
- 🔧 **의존성 없음**: Node.js만 있으면 즉시 실행

## 🔧 요구사항

실행하기 전에 다음이 설치되어 있어야 합니다:

- **Node.js** (버전 14.0.0 이상 권장)
  - 💡 처음 설치하시는 분은 [Node.js 공식 웹사이트](https://nodejs.org)에서 다운로드

### Node.js 설치 확인 방법

터미널(명령 프롬프트)에서 다음 명령어를 실행해보세요:

```bash
node --version
```

정상적으로 설치되었다면 버전 번호가 출력됩니다. (예: `v18.17.0`)

## 🚀 빠른 시작

### 1단계: 프로젝트 다운로드
이 폴더를 원하는 위치에 복사하거나 다운로드하세요.

### 2단계: 터미널 열기
- **Windows**: `Win + R` → `cmd` 입력 후 엔터
- **Mac**: `Cmd + Space` → `터미널` 검색 후 실행
- **Linux**: `Ctrl + Alt + T`

### 3단계: 프로젝트 폴더로 이동
```bash
cd test-output
```

### 4단계: 스크립트 실행
```bash
node hello.js
```

## 📺 실행 예시

터미널에서 명령어를 실행하면 다음과 같은 결과를 볼 수 있습니다:

```bash
$ node hello.js
Hello World
```

**축하합니다! 🎉 성공적으로 첫 번째 Node.js 프로그램을 실행했습니다!**

## 🛠️ 다양한 실행 방법

### 전체 경로로 실행
다른 폴더에서도 실행하고 싶다면:
```bash
node /path/to/test-output/hello.js
```

### Windows에서 더블클릭 실행
1. `hello.js` 파일을 마우스 오른쪽 버튼 클릭
2. "연결 프로그램" → "Node.js" 선택 (Node.js가 설치된 경우)

## ❓ 문제 해결

### 🚨 자주 발생하는 문제들

#### 1. "node: command not found" 오류
**문제**: Node.js가 설치되지 않았거나 PATH에 등록되지 않음

**해결법**:
- [Node.js 공식 사이트](https://nodejs.org)에서 Node.js 다운로드 및 설치
- 설치 후 터미널을 다시 열어서 재시도

#### 2. "Cannot find module" 오류
**문제**: hello.js 파일을 찾을 수 없음

**해결법**:
- 현재 디렉토리에 `hello.js` 파일이 있는지 확인
- `ls` (Mac/Linux) 또는 `dir` (Windows) 명령어로 파일 목록 확인

#### 3. "Permission denied" 오류 (Mac/Linux)
**문제**: 파일 실행 권한 없음

**해결법**:
```bash
chmod +x hello.js
node hello.js
```

### 💡 도움이 필요하다면

1. **Node.js 버전 확인**: `node --version`
2. **현재 디렉토리 확인**: `pwd` (Mac/Linux) 또는 `cd` (Windows)
3. **파일 목록 확인**: `ls` (Mac/Linux) 또는 `dir` (Windows)

## 📁 프로젝트 구조

```
test-output/
├── 📄 hello.js           # 메인 스크립트 파일
├── 📖 README.md          # 사용자 가이드 (이 파일)
├── 📋 CHANGELOG.md       # 변경 이력
└── 🔧 TECHNICAL.md       # 기술 문서
```

## 🎯 다음 단계

Hello World를 성공적으로 실행했다면, 이제 다음을 시도해보세요:

1. **코드 수정해보기**: `hello.js` 파일을 열어서 "Hello World" 대신 다른 메시지 출력
2. **새로운 스크립트 만들기**: 현재 시간을 출력하는 스크립트 작성
3. **Node.js 공부하기**: [Node.js 공식 문서](https://nodejs.org/docs/) 살펴보기

## 📚 참고 자료

- [Node.js 공식 웹사이트](https://nodejs.org)
- [Node.js 한국어 문서](https://nodejs.org/ko/)
- [JavaScript 기초 강의](https://developer.mozilla.org/ko/docs/Learn/JavaScript)
- [터미널 사용법 가이드](https://tutorials.codebar.io/command-line/introduction/tutorial.html)

## 📞 지원 및 문의

- **프로젝트 버전**: 1.0.0
- **개발자**: 박노드 (Node.js 개발자)
- **문서 작성**: 이유진 (사용자가이드작성자)
- **작성일**: 2026-02-24

---

**🌟 프로그래밍의 첫 걸음을 축하드립니다! 계속해서 즐거운 코딩 여정을 이어가세요! 🌟**