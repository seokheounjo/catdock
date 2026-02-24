import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

// MCP 서버 스크립트를 빌드 출력 디렉토리에 복사하는 플러그인
function copyMcpServerPlugin() {
  return {
    name: 'copy-mcp-server',
    closeBundle() {
      const src = resolve('src/main/services/permission-mcp-server.cjs')
      const outDir = resolve('out/main')
      const dest = resolve(outDir, 'permission-mcp-server.cjs')
      if (existsSync(src)) {
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
        copyFileSync(src, dest)
      }
    }
  }
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main')
      }
    },
    plugins: [copyMcpServerPlugin()]
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
