// 퍼미션 프롬프트용 로컬 HTTP 서버
// MCP 서버(permission-mcp-server.cjs)가 여기로 HTTP 요청을 보내고,
// Electron 렌더러에서 사용자가 Allow/Deny 선택
import http from 'http'
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { PermissionRequest } from '../../shared/types'
import * as store from './store'

interface PendingPermission {
  request: PermissionRequest
  resolve: (allowed: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingPermissions = new Map<string, PendingPermission>()
let server: http.Server | null = null
let serverPort = 0

const PERMISSION_TIMEOUT_MS = 60000 // 60초

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

export function startPermissionServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(serverPort)
      return
    }

    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/permission') {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          try {
            const { agentId, toolName, toolInput } = JSON.parse(body)
            const agent = store.getAgent(agentId)
            const requestId = uuid()

            const permReq: PermissionRequest = {
              id: requestId,
              agentId,
              agentName: agent?.name ?? 'Unknown',
              toolName,
              toolInput: toolInput || {},
              timestamp: Date.now()
            }

            const responsePromise = new Promise<boolean>((permResolve) => {
              const timer = setTimeout(() => {
                // 타임아웃 → 자동 거부
                pendingPermissions.delete(requestId)
                broadcast('permission:timeout', permReq)
                permResolve(false)
              }, PERMISSION_TIMEOUT_MS)

              pendingPermissions.set(requestId, {
                request: permReq,
                resolve: permResolve,
                timer
              })
            })

            // 렌더러에 퍼미션 요청 브로드캐스트
            broadcast('permission:request', permReq)

            responsePromise.then((allowed) => {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ allowed }))
            })
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    // 랜덤 포트에 바인드
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (addr && typeof addr === 'object') {
        serverPort = addr.port
        console.log(`[permission-server] 포트 ${serverPort}에서 시작`)
        resolve(serverPort)
      } else {
        reject(new Error('서버 주소를 가져올 수 없음'))
      }
    })

    server.on('error', (err) => {
      console.error('[permission-server] 오류:', err)
      reject(err)
    })
  })
}

export function respondToPermission(requestId: string, allowed: boolean): void {
  const pending = pendingPermissions.get(requestId)
  if (!pending) {
    console.warn(`[permission-server] 알 수 없는 requestId: ${requestId}`)
    return
  }
  clearTimeout(pending.timer)
  pendingPermissions.delete(requestId)
  pending.resolve(allowed)
}

export function getPort(): number {
  return serverPort
}

export function stopPermissionServer(): void {
  if (server) {
    server.close()
    server = null
    serverPort = 0
  }
  // 모든 대기 중 퍼미션 거부
  for (const [id, pending] of pendingPermissions) {
    clearTimeout(pending.timer)
    pending.resolve(false)
    pendingPermissions.delete(id)
  }
}
