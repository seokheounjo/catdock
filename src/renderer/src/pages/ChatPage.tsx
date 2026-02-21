import { ChatWindow } from '../components/chat/ChatWindow'

interface ChatPageProps {
  agentId: string
}

export function ChatPage({ agentId }: ChatPageProps) {
  return <ChatWindow agentId={agentId} />
}
