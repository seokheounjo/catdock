// ── E2E 위임 테스트 ──
// Claude CLI를 직접 호출하여 Jordan이 실제로 DELEGATE 블록을 생성하는지 확인
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const configPath = path.join(process.env.APPDATA, 'virtual-company', 'virtual-company-data', 'config.json')
const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const jordan = data.agents.find(a => a.name === 'Jordan')

if (!jordan) {
  console.error('Jordan 에이전트를 찾을 수 없습니다')
  process.exit(1)
}

console.log('=== E2E 위임 테스트 ===')
console.log('Jordan ID:', jordan.id)
console.log()

// Claude CLI를 직접 호출해서 Jordan의 시스템 프롬프트로 테스트
const userMessage = '이 프로젝트의 README.md 파일을 읽고 요약해줘. 프론트엔드 관련 내용은 Alex에게, 백엔드 관련 내용은 Sam에게 위임해.'

console.log('User:', userMessage)
console.log()
console.log('--- Jordan 응답 ---')

const args = [
  '-p',
  '--output-format', 'stream-json',
  '--model', jordan.model,
  '--max-turns', '3',
  '--permission-mode', 'plan',
  '--system-prompt', jordan.systemPrompt,
  userMessage
]

// 환경변수 정리
const cleanEnv = { ...process.env }
delete cleanEnv.CLAUDECODE
delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
delete cleanEnv.CLAUDE_CODE_SESSION

const proc = spawn('claude', args, {
  cwd: process.cwd(),
  env: cleanEnv,
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe']
})

let fullResponse = ''
let lineBuffer = ''

proc.stdout.on('data', (chunk) => {
  lineBuffer += chunk.toString()
  const lines = lineBuffer.split('\n')
  lineBuffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type === 'assistant') {
        const content = event.message?.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              process.stdout.write(block.text)
              fullResponse += block.text
            }
          }
        }
      }
      if (event.type === 'result' && event.result) {
        fullResponse = event.result
      }
    } catch { /* ignore */ }
  }
})

let stderrBuf = ''
proc.stderr.on('data', (chunk) => {
  stderrBuf += chunk.toString()
})

proc.on('error', (err) => {
  console.error('Process spawn error:', err.message)
  process.exit(1)
})

proc.on('close', (code) => {
  // 마지막 라인 처리
  if (lineBuffer.trim()) {
    try {
      const event = JSON.parse(lineBuffer)
      if (event.type === 'result' && event.result) {
        fullResponse = event.result
      }
    } catch { /* ignore */ }
  }

  console.log('\n\n--- 분석 ---')
  console.log('Exit code:', code)
  if (code !== 0 && !fullResponse) {
    console.log('stderr:', stderrBuf.slice(-500))
  }

  // 위임 블록 확인
  const hasDel = /\[DELEGATE:[^\]]+\]/i.test(fullResponse)
  console.log('DELEGATE 블록 존재:', hasDel ? 'YES' : 'NO')

  if (hasDel) {
    const regex = /\[DELEGATE:([^\]]+)\]([\s\S]*?)\[\/DELEGATE\]/gi
    let match
    let count = 0
    while ((match = regex.exec(fullResponse)) !== null) {
      count++
      console.log(`  위임 ${count}: ${match[1].trim()} -> "${match[2].trim().slice(0, 60)}..."`)
    }
    console.log(`총 ${count}건 위임 감지`)
    console.log('\n=== E2E 위임 테스트 PASS ===')
  } else {
    console.log('Jordan이 위임 블록을 생성하지 않았습니다.')
    console.log('응답 전문 (디버그):')
    console.log(fullResponse.slice(0, 500))
    console.log('\n=== E2E 위임 테스트 — 위임 블록 미생성 (재시도 필요) ===')
  }
})

// 90초 타임아웃
setTimeout(() => {
  console.log('\n[TIMEOUT] 90초 초과')
  proc.kill()
  process.exit(1)
}, 90000)
