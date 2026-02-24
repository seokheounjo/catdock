// MCP 서버 — Claude CLI가 --permission-prompt-tool로 호출
// stdin/stdout JSON-RPC로 MCP 프로토콜 구현
// 퍼미션 요청을 HTTP로 Electron 메인 프로세스에 전달
const http = require('http')

const PERMISSION_SERVER_PORT = parseInt(process.env.PERMISSION_SERVER_PORT || '0', 10)
const PERMISSION_AGENT_ID = process.env.PERMISSION_AGENT_ID || ''

let buffer = ''

process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  processBuffer()
})

function processBuffer() {
  while (true) {
    // Content-Length 기반 파싱
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) break

    const header = buffer.slice(0, headerEnd)
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) {
      // 헤더 없으면 줄바꿈으로 분리 시도
      const lineEnd = buffer.indexOf('\n')
      if (lineEnd === -1) break
      const line = buffer.slice(0, lineEnd).trim()
      buffer = buffer.slice(lineEnd + 1)
      if (line) {
        try {
          handleMessage(JSON.parse(line))
        } catch { /* ignore */ }
      }
      continue
    }

    const contentLength = parseInt(match[1], 10)
    const bodyStart = headerEnd + 4
    if (buffer.length < bodyStart + contentLength) break

    const body = buffer.slice(bodyStart, bodyStart + contentLength)
    buffer = buffer.slice(bodyStart + contentLength)

    try {
      handleMessage(JSON.parse(body))
    } catch (err) {
      sendError(null, -32700, 'Parse error')
    }
  }
}

function handleMessage(msg) {
  if (msg.method === 'initialize') {
    sendResponse(msg.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'permission_prompt', version: '1.0.0' }
    })
  } else if (msg.method === 'notifications/initialized') {
    // 알림, 응답 불필요
  } else if (msg.method === 'tools/list') {
    sendResponse(msg.id, {
      tools: [{
        name: 'prompt',
        description: 'Ask the user for permission to use a tool',
        inputSchema: {
          type: 'object',
          properties: {
            tool_name: { type: 'string', description: 'The name of the tool requesting permission' },
            tool_input: { type: 'object', description: 'The input that will be passed to the tool' }
          },
          required: ['tool_name']
        }
      }]
    })
  } else if (msg.method === 'tools/call') {
    const toolName = msg.params?.arguments?.tool_name || 'unknown'
    const toolInput = msg.params?.arguments?.tool_input || {}

    requestPermission(toolName, toolInput)
      .then((allowed) => {
        sendResponse(msg.id, {
          content: [{
            type: 'text',
            text: allowed ? 'Permission granted by user.' : 'Permission denied by user.'
          }]
        })
      })
      .catch((err) => {
        sendResponse(msg.id, {
          content: [{
            type: 'text',
            text: `Permission denied (error: ${err.message})`
          }]
        })
      })
  } else if (msg.id !== undefined) {
    sendError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

function requestPermission(toolName, toolInput) {
  return new Promise((resolve, reject) => {
    if (!PERMISSION_SERVER_PORT) {
      resolve(false)
      return
    }

    const body = JSON.stringify({
      agentId: PERMISSION_AGENT_ID,
      toolName,
      toolInput
    })

    const req = http.request({
      hostname: '127.0.0.1',
      port: PERMISSION_SERVER_PORT,
      path: '/permission',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 65000
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          resolve(result.allowed === true)
        } catch {
          resolve(false)
        }
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })

    req.write(body)
    req.end()
  })
}

function sendResponse(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function send(msg) {
  const body = JSON.stringify(msg)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}
