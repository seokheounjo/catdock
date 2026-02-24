import { BrowserWindow } from 'electron'

// 16ms 윈도우로 IPC 메시지 배치 — 고빈도 이벤트 (stream-delta 등) 최적화
interface PendingBroadcast {
  channel: string
  args: unknown[]
}

const pendingBroadcasts: PendingBroadcast[] = []
let flushScheduled = false

function flush(): void {
  flushScheduled = false
  if (pendingBroadcasts.length === 0) return

  const windows = BrowserWindow.getAllWindows()
  const batch = pendingBroadcasts.splice(0)

  for (const win of windows) {
    if (win.isDestroyed()) continue
    for (const { channel, args } of batch) {
      win.webContents.send(channel, ...args)
    }
  }
}

// 배치 브로드캐스트 — 16ms 프레임에 모아서 전송
export function batchBroadcast(channel: string, ...args: unknown[]): void {
  pendingBroadcasts.push({ channel, args })

  if (!flushScheduled) {
    flushScheduled = true
    setTimeout(flush, 16)
  }
}

// 즉시 브로드캐스트 — 배치 없이 즉시 전송 (중요한 이벤트용)
export function immediateBroadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  })
}
