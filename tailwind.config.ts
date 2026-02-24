import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  darkMode: 'class', // 다크모드를 클래스 기반으로 활성화
  theme: {
    extend: {
      // 기본 색상은 CSS 변수로 정의하여 동적 테마 전환 지원
      colors: {
        // 시스템 색상
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',

        // 상태 색상
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',

        // 배경 및 텍스트 색상
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-hover': 'var(--color-surface-hover)',
        text: 'var(--color-text)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',

        // 채팅 전용 색상
        'chat-bg': 'var(--color-chat-bg)',
        'chat-sidebar': 'var(--color-chat-sidebar)',
        'bubble-user': 'var(--color-bubble-user)',
        'bubble-assistant': 'var(--color-bubble-assistant)'
      },
      // 부드러운 테마 전환을 위한 트랜지션
      transitionProperty: {
        theme:
          'background-color, border-color, color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter'
      },
      transitionDuration: {
        theme: '200ms'
      }
    }
  },
  plugins: []
}

export default config
