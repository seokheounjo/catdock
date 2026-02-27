// 로컬 LLM 자동 감지 서비스 — Ollama, LM Studio, OpenAI 호환 서버 검색
import { execFileSync } from 'child_process'
import http from 'http'
import { DiscoveredLocalModel, LlmDiscoveryResult, LocalLlmSource } from '../../shared/types'

// ── HTTP 유틸 ──

function httpGet(url: string, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        timeout: timeoutMs
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve(data))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

// ── 모델 이름 → 표시명 변환 ──

function formatModelName(raw: string): string {
  // 'qwen3:32b' → 'Qwen3 32B', 'llama3.1:8b' → 'Llama3.1 8B'
  const parts = raw.split(':')
  const name = parts[0]
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const tag = parts[1] ? ` ${parts[1].toUpperCase()}` : ''
  return `${name}${tag}`
}

// ── 파라미터 수 추출 ──

function extractParamCount(name: string): string | undefined {
  const match = name.match(/(\d+\.?\d*)[bB]/)
  return match ? `${match[1]}B` : undefined
}

// ── Ollama 감지 ──

export function discoverOllamaModels(): DiscoveredLocalModel[] {
  const now = Date.now()
  const models: DiscoveredLocalModel[] = []

  // 방법 1: CLI로 시도
  try {
    const output = execFileSync('ollama', ['list'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    })
    const lines = output.trim().split('\n').slice(1) // 헤더 제거
    for (const line of lines) {
      if (!line.trim()) continue
      const cols = line.trim().split(/\s+/)
      const modelId = cols[0] // 예: qwen3:32b
      if (!modelId) continue
      const size = cols.find((c) => /^\d+(\.\d+)?\s*[GMKT]B$/i.test(c))
      models.push({
        id: `ollama/${modelId}`,
        name: formatModelName(modelId),
        source: 'ollama',
        modelId,
        size,
        parameterCount: extractParamCount(modelId),
        isRunning: true,
        discoveredAt: now
      })
    }
    if (models.length > 0) return models
  } catch {
    // CLI 실패 → HTTP로 시도
  }

  // 방법 2: HTTP API
  return [] // 동기 함수에서는 빈 배열, 비동기 버전은 아래
}

async function discoverOllamaModelsAsync(): Promise<DiscoveredLocalModel[]> {
  const now = Date.now()

  // CLI 먼저 시도
  const cliModels = discoverOllamaModels()
  if (cliModels.length > 0) return cliModels

  // HTTP API 시도
  try {
    const data = await httpGet('http://localhost:11434/api/tags')
    const parsed = JSON.parse(data)
    const models: DiscoveredLocalModel[] = []
    for (const m of parsed.models || []) {
      const modelId = m.name || m.model
      if (!modelId) continue
      const sizeBytes = m.size
      const size = sizeBytes ? `${Math.round(sizeBytes / 1024 / 1024 / 1024)}GB` : undefined
      models.push({
        id: `ollama/${modelId}`,
        name: formatModelName(modelId),
        source: 'ollama',
        modelId,
        size,
        parameterCount: extractParamCount(modelId),
        isRunning: true,
        discoveredAt: now
      })
    }
    return models
  } catch {
    return []
  }
}

// ── LM Studio 감지 ──

async function discoverLmStudioModels(): Promise<DiscoveredLocalModel[]> {
  const now = Date.now()
  try {
    const data = await httpGet('http://localhost:1234/v1/models')
    const parsed = JSON.parse(data)
    const models: DiscoveredLocalModel[] = []
    for (const m of parsed.data || []) {
      const modelId = m.id
      if (!modelId) continue
      models.push({
        id: `openai/${modelId}`,
        name: formatModelName(modelId),
        source: 'lmstudio',
        modelId,
        parameterCount: extractParamCount(modelId),
        baseUrl: 'http://localhost:1234/v1',
        isRunning: true,
        discoveredAt: now
      })
    }
    return models
  } catch {
    return []
  }
}

// ── OpenAI 호환 서버 감지 ──

const OPENAI_COMPAT_PORTS = [8080, 5000, 8000] // llama.cpp, generic, vLLM

async function discoverOpenAiCompatible(): Promise<DiscoveredLocalModel[]> {
  const now = Date.now()
  const allModels: DiscoveredLocalModel[] = []

  for (const port of OPENAI_COMPAT_PORTS) {
    try {
      const data = await httpGet(`http://localhost:${port}/v1/models`)
      const parsed = JSON.parse(data)
      for (const m of parsed.data || []) {
        const modelId = m.id
        if (!modelId) continue
        // LM Studio 포트와 겹치지 않게 체크
        if (port === 1234) continue
        allModels.push({
          id: `openai/${modelId}`,
          name: formatModelName(modelId),
          source: 'openai-compatible',
          modelId,
          parameterCount: extractParamCount(modelId),
          baseUrl: `http://localhost:${port}/v1`,
          isRunning: true,
          discoveredAt: now
        })
      }
    } catch {
      // 이 포트에서 서버 없음
    }
  }

  return allModels
}

// ── 소스 상태 확인 ──

export async function checkSourceAvailable(
  source: LocalLlmSource
): Promise<{ available: boolean; version?: string; error?: string }> {
  switch (source) {
    case 'ollama': {
      try {
        const output = execFileSync('ollama', ['--version'], {
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32'
        }).trim()
        const version = output.match(/(\d+\.\d+\.\d+)/)?.[1]
        return { available: true, version }
      } catch {
        // HTTP로 확인
        try {
          await httpGet('http://localhost:11434/api/tags')
          return { available: true }
        } catch {
          return { available: false, error: 'Ollama가 설치되지 않았거나 실행 중이 아닙니다.' }
        }
      }
    }
    case 'lmstudio': {
      try {
        await httpGet('http://localhost:1234/v1/models')
        return { available: true }
      } catch {
        return { available: false, error: 'LM Studio 서버가 실행 중이 아닙니다.' }
      }
    }
    case 'openai-compatible': {
      for (const port of OPENAI_COMPAT_PORTS) {
        try {
          await httpGet(`http://localhost:${port}/v1/models`)
          return { available: true }
        } catch {
          // 다음 포트 시도
        }
      }
      return { available: false, error: 'OpenAI 호환 서버를 찾을 수 없습니다.' }
    }
  }
}

// ── 전체 스캔 ──

export async function discoverAllLocalModels(): Promise<LlmDiscoveryResult> {
  const [ollamaModels, lmStudioModels, openAiModels] = await Promise.all([
    discoverOllamaModelsAsync(),
    discoverLmStudioModels(),
    discoverOpenAiCompatible()
  ])

  // 중복 제거 (같은 id)
  const unique = new Map<string, DiscoveredLocalModel>()
  for (const model of [...ollamaModels, ...lmStudioModels, ...openAiModels]) {
    if (!unique.has(model.id)) {
      unique.set(model.id, model)
    }
  }

  // 소스 상태 확인
  const sources = await Promise.all([
    checkSourceAvailable('ollama').then((r) => ({ source: 'ollama' as LocalLlmSource, ...r })),
    checkSourceAvailable('lmstudio').then((r) => ({ source: 'lmstudio' as LocalLlmSource, ...r })),
    checkSourceAvailable('openai-compatible').then((r) => ({
      source: 'openai-compatible' as LocalLlmSource,
      ...r
    }))
  ])

  const result: LlmDiscoveryResult = {
    models: Array.from(unique.values()),
    sources,
    scannedAt: Date.now()
  }

  console.log(
    `[llm-discovery] 스캔 완료: ${result.models.length}개 모델 발견 (Ollama: ${ollamaModels.length}, LM Studio: ${lmStudioModels.length}, OpenAI: ${openAiModels.length})`
  )
  return result
}
