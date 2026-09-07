# Gemini KR IME fix

Gemini 웹 버전에서 한글 입력 시 엔터를 두 번 눌러야 하는 현상을 해결합니다.

# 설치 방법

1. [이곳을](https://github.com/luminen529/fix-kr-gemini/archive/refs/heads/main.zip) 클릭하여 다운로드
2. Chrome에서 `chrome://extensions`를 엽니다.
3. 오른쪽 위의 `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램을 로드`를 클릭합니다.
5. 다운로드한 폴더를 선택합니다.
6. Gemini 탭을 새로고침합니다.

기존 설치를 업데이트할 때는 새 파일로 교체한 뒤 확장 프로그램 관리 화면에서 새로고침하고, Gemini 탭도 새로고침합니다. Edge에서는 `edge://extensions`에서 같은 방법으로 설치할 수 있습니다.

## 호환성 및 동작

- OS 이름으로 분기하지 않고 IME 조합 이벤트와 Enter 키 정보를 확인합니다. Windows IME에서 `key`가 `Process`로 전달되는 경우에는 `code`의 `Enter` / `NumpadEnter`를 사용합니다.
- IME의 마지막 글자 확정 동작을 유지하고 조합이 끝난 후 보내기 버튼을 클릭합니다. 일반 Enter, Shift+Enter 및 다른 보조 키 조합은 기존 동작을 유지합니다.
- 추가 권한, 외부 라이브러리, 백그라운드 프로세스, 주기적 폴링은 사용하지 않습니다.
- Chrome/Edge 등 Manifest V3 확장을 지원하는 브라우저를 대상으로 합니다. 키 정보를 제공하지 않는 가상 키보드에서는 Enter를 추측하여 전송하지 않습니다. 모든 OS·IME 조합의 실기기 검증을 의미하지는 않습니다.

## 검증

Node.js에서 `node --test tests/content.test.cjs`로 이벤트 순서 회귀 테스트를 실행합니다. 테스트 파일은 확장 프로그램에서 로드하지 않습니다.

실기기 확인: Windows Microsoft 한국어 IME 및 macOS 한국어 입력기에서 마지막 글자가 조합 중인 상태로 Enter와 숫자패드 Enter를 각각 눌러, 글자 누락 없이 한 번만 전송되는지 확인합니다. Shift+Enter 줄바꿈, 영문 Enter, Esc 조합 취소도 확인합니다. 자동 테스트는 이벤트를 모사하며 실제 OS 입력기나 Gemini 서버를 실행하지 않습니다.
