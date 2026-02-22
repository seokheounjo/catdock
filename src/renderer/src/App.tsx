import { useState, useEffect } from 'react'
import { DockPage } from './pages/DockPage'
import { ChatPage } from './pages/ChatPage'
import { EditorPage } from './pages/EditorPage'
import { GroupChatPage } from './pages/GroupChatPage'
import { NewConversationPage } from './pages/NewConversationPage'

function getRoute(): { page: string; id?: string } {
  const hash = window.location.hash.replace('#', '')
  if (hash.startsWith('/chat/')) {
    return { page: 'chat', id: hash.replace('/chat/', '') }
  }
  if (hash.startsWith('/editor/')) {
    return { page: 'editor', id: hash.replace('/editor/', '') }
  }
  if (hash === '/editor') {
    return { page: 'editor' }
  }
  if (hash.startsWith('/group-chat/')) {
    return { page: 'group-chat', id: hash.replace('/group-chat/', '') }
  }
  if (hash === '/new-conversation') {
    return { page: 'new-conversation' }
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

  if (route.page === 'chat' && route.id) {
    return <ChatPage agentId={route.id} />
  }

  if (route.page === 'editor') {
    return <EditorPage agentId={route.id} />
  }

  if (route.page === 'group-chat' && route.id) {
    return <GroupChatPage conversationId={route.id} />
  }

  if (route.page === 'new-conversation') {
    return <NewConversationPage />
  }

  return <DockPage />
}

export default App
