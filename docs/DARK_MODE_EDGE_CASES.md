# 다크모드 구현 엣지케이스 목록

## 🔥 Critical Edge Cases (P0)

### 1. 테마 전환 중 깜빡임 (FOUC - Flash of Unstyled Content)

**문제**: CSS 변수 업데이트와 렌더링 사이의 시간차로 인한 깜빡임
```typescript
// 위험한 패턴
document.documentElement.style.setProperty('--color-chat-bg', newColor)
// 브라우저가 리렌더링하는 동안 잠깐 기본 색상이 보일 수 있음
```

**재현 단계**:
1. 다크모드에서 라이트모드로 빠르게 전환
2. 특히 Chat 창처럼 복잡한 UI에서 발생 가능성 높음
3. 애니메이션 중 전환 시도

**영향도**: 사용자 경험 크게 저하, 간질 발작 위험

### 2. 여러 창 간 테마 동기화 실패

**문제**: IPC 메시지 전달 실패 또는 지연으로 창별 테마 불일치
```typescript
// settings-manager.ts의 브로드캐스트 실패 가능성
BrowserWindow.getAllWindows().forEach((win) => {
  win.webContents.send('settings:changed', settings) // 실패 가능
})
```

**재현 단계**:
1. 5개 이상 창 열기 (Dock, Chat×3, Dashboard)
2. Dock에서 테마 전환
3. 일부 창이 업데이트되지 않음

**영향도**: 사용자 혼란, 일관성 없는 UI

### 3. 앱 시작 시 저장된 테마 로딩 실패

**문제**: config.json 읽기 실패 또는 손상으로 테마 설정 복원 불가
```typescript
// store.ts의 load() 함수에서 예외 처리 부족 가능성
try {
  const raw = readFileSync(getStorePath(), 'utf-8')
  data = { ...defaults, ...JSON.parse(raw) }
} catch {
  data = { ...defaults } // 테마 설정이 기본값으로 리셋됨
}
```

**재현 단계**:
1. 다크모드 설정 후 앱 종료
2. config.json 파일 권한 제거 또는 손상
3. 앱 재시작 시 라이트모드로 되돌아감

**영향도**: 사용자 설정 손실, 신뢰성 저하

## ⚠️ High Priority Edge Cases (P1)

### 4. 시스템 테마 변경 감지 중 무한 루프

**문제**: 시스템 테마 변경 감지 시 앱 테마도 변경되어 다시 이벤트 발생
```typescript
// 위험한 패턴
nativeTheme.on('updated', () => {
  const isDark = nativeTheme.shouldUseDarkColors
  updateSettings({ theme: isDark ? 'dark' : 'light' })
  // 이 설정 변경이 다시 'updated' 이벤트를 발생시킬 수 있음
})
```

**재현 단계**:
1. "시스템 테마 따르기" 옵션 활성화
2. macOS/Windows에서 다크모드 토글
3. CPU 사용률 급증 및 앱 응답 없음

**영향도**: 앱 크래시, 시스템 리소스 고갈

### 5. CSS 변수 업데이트 중 스타일 충돌

**문제**: 기존 하드코딩된 Tailwind 클래스와 새로운 CSS 변수 충돌
```css
/* 현재 코드에 존재하는 하드코딩 */
.bg-slate-700/60 /* 테마 변경 시에도 여전히 어두운 색상 */
.text-white/80   /* 라이트 테마에서 가독성 저하 */
```

**재현 단계**:
1. 라이트 테마로 전환
2. Dock의 대시보드 버튼 색상이 여전히 어두움
3. 컨텍스트 메뉴 배경이 어두워 텍스트 안 보임

**영향도**: UI 가독성 저하, 접근성 문제

### 6. 에이전트 세션 중 테마 전환 시 채팅 기록 색상 불일치

**문제**: 기존 메시지와 새 메시지 간 색상 차이 발생
```typescript
// MessageBubble 컴포넌트에서 이미 렌더링된 메시지
<div className="bg-bubble-user"> {/* CSS 변수 기반 */}
  {message.content}
</div>
// 새로운 메시지는 새 테마 색상, 기존 메시지는 캐시된 색상
```

**재현 단계**:
1. Claude와 대화 중
2. 여러 메시지 주고받기
3. 다크모드 전환
4. 기존 메시지와 새 메시지 색상 다름

**영향도**: 시각적 일관성 저해

## ⚡ Medium Priority Edge Cases (P2)

### 7. Permission Dialog 표시 중 테마 전환

**문제**: 모달 다이얼로그가 테마 변경 이벤트를 받지 못함
```typescript
// PermissionDialog가 Portal로 렌더링되는 경우
ReactDOM.createPortal(<Dialog />, document.body)
// 테마 변경 시 Portal 내부 컴포넌트가 업데이트되지 않을 수 있음
```

**재현 단계**:
1. 에이전트가 파일 편집 권한 요청
2. Permission Dialog 표시 상태에서 테마 전환
3. 다이얼로그만 이전 테마 색상 유지

**영향도**: 일부 UI 컴포넌트 불일치

### 8. 스트리밍 메시지 수신 중 테마 변경

**문제**: 실시간으로 업데이트되는 스트리밍 텍스트의 색상 처리
```typescript
// StreamingText 컴포넌트
const [content, setContent] = useState('')
// 스트리밍 중 테마가 바뀌면 이미 렌더링된 부분과 새로 추가되는 부분의 색상 차이
```

**재현 단계**:
1. 에이전트에게 긴 응답 요청 (코드 생성 등)
2. 스트리밍 응답 수신 중
3. 테마 전환
4. 응답 텍스트 일부만 새 테마 적용

**영향도**: 텍스트 가독성 일시적 저하

### 9. 다중 모니터 환경에서 창별 다른 색상 프로필

**문제**: 모니터별 색상 프로필 차이로 동일한 테마가 다르게 보임
```css
/* 같은 색상이지만 모니터별로 다르게 표시 */
--color-chat-bg: oklch(0.15 0.02 260);
```

**재현 단계**:
1. 서로 다른 색상 프로필을 가진 2개 모니터 사용
2. Chat 창을 각 모니터에 배치
3. 동일한 다크 테마임에도 색상 차이 발생

**영향도**: 시각적 일관성 저하 (하드웨어 의존적)

## 🔍 Low Priority Edge Cases (P3)

### 10. 메모리 부족 상황에서 테마 전환

**문제**: 시스템 메모리 부족 시 CSS 변수 업데이트 지연 또는 실패
```typescript
// 많은 DOM 요소의 스타일을 동시에 업데이트
document.querySelectorAll('[style*="--color"]').forEach(el => {
  // 메모리 부족 시 일부 요소만 업데이트될 수 있음
})
```

**재현 단계**:
1. 시스템 메모리 90% 이상 사용 상황 조성
2. 여러 창과 많은 채팅 기록 로드
3. 테마 전환 시도
4. 일부 요소만 업데이트됨

**영향도**: 극한 상황에서만 발생, 실사용에서 드뭄

### 11. 브라우저 확대/축소 중 테마 전환

**문제**: 브라우저 확대/축소 상태에서 CSS 변수 계산 오류
```css
/* 확대/축소 시 색상 값 계산이 달라질 수 있음 */
color: oklch(calc(0.15 * var(--zoom-factor)) 0.02 260);
```

**재현 단계**:
1. Electron 창을 200% 확대
2. 테마 전환
3. 일부 색상이 의도와 다르게 표시

**영향도**: 접근성 도구 사용자에게 영향

### 12. 네트워크 지연으로 인한 아바타 이미지 로딩 문제

**문제**: DiceBear 아바타 생성 시 테마 변경이 반영되지 않음
```typescript
// avatar.ts
export function generateAvatar(seed: string, style: string) {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`
  // 이미 캐시된 이미지는 테마 변경 시에도 이전 색상 유지
}
```

**재현 단계**:
1. 에이전트 아바타 로드 완료
2. 테마 전환
3. 아바타는 이전 테마 색상 유지

**영향도**: 서드파티 서비스 의존적, 캐시 정책에 따름

## 🧪 개발 환경 특이 케이스

### 13. Hot Reload 중 테마 설정 손실

**문제**: 개발 중 Hot Reload 시 메모리상의 테마 설정이 리셋됨
```typescript
// 개발 환경에서만 발생
if (module.hot) {
  module.hot.accept()
  // 현재 테마 상태가 기본값으로 리셋될 수 있음
}
```

### 14. 빌드 최적화로 인한 CSS 변수 누락

**문제**: 프로덕션 빌드 시 사용되지 않는 CSS 변수 제거
```css
/* PurgeCSS가 사용하지 않는 테마 변수를 제거할 수 있음 */
--color-light-bg: oklch(0.95 0.02 260); /* 미사용으로 판단되어 제거 */
```

## 📝 테스트 우선순위 권장사항

1. **P0 케이스**: 반드시 해결 후 배포
2. **P1 케이스**: 일반적인 사용에서 자주 발생, 우선 수정
3. **P2 케이스**: 특정 상황에서만 발생, 점진적 개선
4. **P3 케이스**: 문서화 후 추후 개선 예정으로 분류

각 엣지케이스에 대해 구체적인 재현 스크립트와 자동화 테스트를 작성하여 회귀 방지가 필요합니다.