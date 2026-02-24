# 다크모드 기능 자동화 테스트 제안서

## 📋 개요

Virtual Company 앱의 다크모드 기능에 대한 자동화 테스트 전략입니다. Electron 앱 특성을 고려하여 효율적이고 안정적인 테스트 접근법을 제안합니다.

---

## 🛠️ 테스트 기술 스택 권장사항

### E2E 테스트
- **Playwright for Electron**: Electron 앱 테스트에 최적화
- **Spectron 대안**: 더 이상 지원되지 않으므로 Playwright 권장
- **webContents API**: Electron 특화 기능 테스트

### 단위 테스트
- **Jest**: 기존 프로젝트와 일관성 유지
- **@testing-library/react**: React 컴포넌트 테스트
- **jest-electron**: Electron 환경 단위 테스트

### 시각적 회귀 테스트
- **Playwright Screenshots**: 자동 스크린샷 비교
- **Chromatic**: Storybook과 연동된 시각적 테스트 (선택사항)

---

## 🎯 자동화 가능한 테스트 시나리오

### Level 1: 기본 기능 자동화 (High Priority)

#### 1.1 테마 토글 기본 동작
```typescript
// test/e2e/theme-toggle.spec.ts
describe('Dark Mode Toggle', () => {
  test('should toggle between dark and light themes', async () => {
    // Dashboard 창 열기
    await app.openDashboard()
    await page.click('[data-testid="settings-tab"]')

    // 현재 테마 확인
    const initialTheme = await page.getAttribute('html', 'data-theme')

    // 토글 버튼 클릭
    await page.click('[data-testid="theme-toggle"]')

    // 테마 변경 확인 (최대 300ms 대기)
    await expect(page.locator('html')).toHaveAttribute('data-theme',
      initialTheme === 'dark' ? 'light' : 'dark', { timeout: 300 })
  })

  test('should persist theme setting after restart', async () => {
    // 테마 변경
    await toggleTheme('dark')

    // 앱 재시작
    await app.restart()

    // 테마 유지 확인
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})
```

#### 1.2 여러 창 동기화
```typescript
// test/e2e/multi-window-sync.spec.ts
describe('Multi-Window Theme Sync', () => {
  test('should sync theme across all open windows', async () => {
    // 여러 창 열기
    const dockPage = await app.openDock()
    const chatPage = await app.openChat('agent-1')
    const dashboardPage = await app.openDashboard()

    // Dashboard에서 테마 변경
    await dashboardPage.toggleTheme('dark')

    // 모든 창에서 테마 변경 확인
    await Promise.all([
      expect(dockPage.locator('html')).toHaveAttribute('data-theme', 'dark'),
      expect(chatPage.locator('html')).toHaveAttribute('data-theme', 'dark'),
      expect(dashboardPage.locator('html')).toHaveAttribute('data-theme', 'dark')
    ])
  })
})
```

### Level 2: CSS 변수 및 스타일 검증

#### 2.1 CSS 변수 값 확인
```typescript
// test/e2e/css-variables.spec.ts
describe('CSS Variables', () => {
  test('should update CSS variables on theme change', async () => {
    await page.goto('#/dashboard')

    // 다크 테마 CSS 변수 확인
    await toggleTheme('dark')
    const darkBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-chat-bg'))
    expect(darkBg.trim()).toBe('oklch(0.15 0.02 260)')

    // 라이트 테마 CSS 변수 확인
    await toggleTheme('light')
    const lightBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-chat-bg'))
    expect(lightBg.trim()).toBe('oklch(0.95 0.02 260)')
  })
})
```

#### 2.2 색상 대비 자동 검증
```typescript
// test/e2e/accessibility.spec.ts
describe('Color Contrast', () => {
  test('should meet WCAG AA contrast requirements', async () => {
    const pages = ['#/dock', '#/dashboard', '#/chat/agent-1']

    for (const theme of ['dark', 'light']) {
      await toggleTheme(theme)

      for (const pagePath of pages) {
        await page.goto(pagePath)

        // 텍스트 요소들의 색상 대비 확인
        const textElements = await page.locator('[data-testid*="text"]').all()

        for (const element of textElements) {
          const contrast = await calculateContrast(element)
          expect(contrast).toBeGreaterThanOrEqual(4.5) // WCAG AA 기준
        }
      }
    }
  })
})

async function calculateContrast(element: Locator): Promise<number> {
  return await element.evaluate((el) => {
    const style = getComputedStyle(el)
    const bgColor = style.backgroundColor
    const textColor = style.color
    // 대비 계산 로직 (색상 파싱 및 대비 공식)
    return calculateColorContrast(bgColor, textColor)
  })
}
```

### Level 3: 성능 및 메모리 테스트

#### 3.1 메모리 누수 감지
```typescript
// test/e2e/memory-leak.spec.ts
describe('Memory Usage', () => {
  test('should not leak memory on repeated theme changes', async () => {
    // 초기 메모리 측정
    const initialMemory = await getMemoryUsage()

    // 100회 테마 전환
    for (let i = 0; i < 100; i++) {
      await toggleTheme(i % 2 === 0 ? 'dark' : 'light')
      await page.waitForTimeout(10) // 짧은 대기
    }

    // 가비지 컬렉션 강제 실행
    await forceGarbageCollection()

    // 최종 메모리 측정
    const finalMemory = await getMemoryUsage()
    const memoryIncrease = (finalMemory - initialMemory) / initialMemory

    // 메모리 증가량이 10% 이하여야 함
    expect(memoryIncrease).toBeLessThan(0.1)
  })
})

async function getMemoryUsage(): Promise<number> {
  return await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize || 0
  })
}
```

#### 3.2 성능 측정
```typescript
// test/e2e/performance.spec.ts
describe('Theme Change Performance', () => {
  test('should complete theme change within 300ms', async () => {
    await page.goto('#/dashboard')

    // Performance API로 측정
    const duration = await page.evaluate(async () => {
      const start = performance.now()

      // 테마 변경 트리거
      document.querySelector('[data-testid="theme-toggle"]')?.click()

      // DOM 업데이트 완료 대기
      await new Promise(resolve => {
        const observer = new MutationObserver(() => {
          if (document.documentElement.getAttribute('data-theme')) {
            observer.disconnect()
            resolve(void 0)
          }
        })
        observer.observe(document.documentElement, { attributes: true })
      })

      return performance.now() - start
    })

    expect(duration).toBeLessThan(300)
  })
})
```

### Level 4: 시각적 회귀 테스트

#### 4.1 스크린샷 비교
```typescript
// test/e2e/visual-regression.spec.ts
describe('Visual Regression', () => {
  const pages = [
    { name: 'dock', path: '#/dock' },
    { name: 'dashboard', path: '#/dashboard' },
    { name: 'chat', path: '#/chat/agent-1' },
    { name: 'editor', path: '#/editor' }
  ]

  for (const pageInfo of pages) {
    test(`${pageInfo.name} - dark theme visual consistency`, async () => {
      await page.goto(pageInfo.path)
      await toggleTheme('dark')
      await page.waitForLoadState('networkidle')

      // 스크린샷 촬영 및 기준선과 비교
      await expect(page).toHaveScreenshot(`${pageInfo.name}-dark.png`, {
        fullPage: true,
        threshold: 0.2 // 픽셀 차이 허용치 20%
      })
    })

    test(`${pageInfo.name} - light theme visual consistency`, async () => {
      await page.goto(pageInfo.path)
      await toggleTheme('light')
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveScreenshot(`${pageInfo.name}-light.png`, {
        fullPage: true,
        threshold: 0.2
      })
    })
  }
})
```

---

## 🧪 단위 테스트 시나리오

### 테마 관련 Hook 테스트
```typescript
// test/unit/useTheme.test.ts
describe('useTheme Hook', () => {
  test('should return current theme state', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('dark') // 기본값
    expect(typeof result.current.toggleTheme).toBe('function')
  })

  test('should toggle theme when called', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('light')
  })
})
```

### Settings Store 테스트
```typescript
// test/unit/settings-store.test.ts
describe('Settings Store', () => {
  test('should save theme setting to config', async () => {
    const mockUpdateSettings = jest.fn()
    window.api.settings.update = mockUpdateSettings

    const store = useSettingsStore.getState()
    await store.updateSettings({ theme: 'dark' })

    expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })
})
```

---

## 🔧 테스트 인프라 구성

### 1. 테스트 환경 설정
```json
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  use: {
    // Electron 앱 실행 설정
    electronApp: './out/main/index.js',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'Windows',
      use: { platform: 'win32' }
    },
    {
      name: 'macOS',
      use: { platform: 'darwin' }
    },
    {
      name: 'Linux',
      use: { platform: 'linux' }
    }
  ]
})
```

### 2. CI/CD 통합
```yaml
# .github/workflows/test-dark-mode.yml
name: Dark Mode Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: pnpm install

    - name: Run unit tests
      run: pnpm test:unit

    - name: Build app
      run: pnpm build

    - name: Run E2E tests
      run: pnpm test:e2e

    - name: Upload test results
      if: failure()
      uses: actions/upload-artifact@v3
      with:
        name: test-results-${{ matrix.os }}
        path: test-results/
```

---

## 📊 자동화 우선순위 및 로드맵

### Phase 1 (즉시 구현 - 2주)
- [ ] 기본 테마 토글 E2E 테스트
- [ ] 여러 창 동기화 테스트
- [ ] 설정 저장/복원 테스트
- [ ] CI/CD 통합

### Phase 2 (단기 - 4주)
- [ ] CSS 변수 검증 테스트
- [ ] 성능 측정 테스트
- [ ] 메모리 사용량 테스트
- [ ] 색상 대비 자동 검증

### Phase 3 (중기 - 8주)
- [ ] 시각적 회귀 테스트
- [ ] 다양한 OS 환경 테스트
- [ ] 접근성 자동 테스트
- [ ] 브라우저 호환성 테스트

### Phase 4 (장기 - 12주)
- [ ] AI 기반 시각적 품질 검증
- [ ] 사용자 시나리오 자동화
- [ ] 부하 테스트 (대량 창 열기 등)
- [ ] 테스트 결과 대시보드 구축

---

## 💡 구현 권장사항

### 1. 테스트 데이터 관리
- 테스트용 config.json 템플릿 제공
- 각 테스트별 격리된 데이터 디렉토리 사용
- 테스트 후 데이터 정리 자동화

### 2. 신뢰성 향상
- 네트워크 요청 모킹 (아바타 이미지 등)
- 타이밍 이슈 해결을 위한 적절한 대기
- 플레이키 테스트 방지를 위한 retry 로직

### 3. 디버깅 지원
- 실패한 테스트의 스크린샷/비디오 자동 저장
- 상세한 로그 수집
- 테스트 결과 리포트 자동 생성

### 4. 개발자 경험
- 로컬에서 쉽게 실행 가능한 테스트 스크립트
- Visual Studio Code 통합
- 테스트 결과 실시간 피드백

---

## 🎯 성공 지표

### 자동화 커버리지 목표
- [ ] P0 엣지케이스 100% 자동화
- [ ] P1 엣지케이스 80% 이상 자동화
- [ ] 회귀 버그 감소율 90% 이상
- [ ] 테스트 실행 시간 10분 이내

### 품질 지표
- [ ] 테스트 실패율 < 1% (플레이키 테스트 최소화)
- [ ] 코드 커버리지 85% 이상 (테마 관련 코드)
- [ ] CI/CD 파이프라인 안정성 99% 이상

이 자동화 테스트 전략을 통해 다크모드 기능의 품질과 안정성을 크게 향상시킬 수 있으며, 향후 테마 관련 기능 추가 시에도 안전한 개발이 가능할 것입니다.