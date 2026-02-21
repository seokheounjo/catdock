import { useState, useEffect } from 'react'
import { DockPage } from './pages/DockPage'
import { ChatPage } from './pages/ChatPage'
import { EditorPage } from './pages/EditorPage'

function getRoute(): { page: string; agentId?: string } {
  const hash = window.location.hash.replace('#', '')
  if (hash.startsWith('/chat/')) {
    return { page: 'chat', agentId: hash.replace('/chat/', '') }
  }
  if (hash.startsWith('/editor/')) {
    return { page: 'editor', agentId: hash.replace('/editor/', '') }
  }
  if (hash === '/editor') {
    return { page: 'editor' }
  }
  if (hash === '/dock') {
    return { page: 'dock' }
  }
  return { page: 'dock' }
}

function App() {
  const [route, setRoute] = useState(getRoute)

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route.page === 'chat' && route.agentId) {
    return <ChatPage agentId={route.agentId} />
  }

  if (route.page === 'editor') {
    return <EditorPage agentId={route.agentId} />
  }

  return <DockPage />
}

export default App
