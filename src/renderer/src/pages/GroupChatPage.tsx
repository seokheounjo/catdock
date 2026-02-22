import { GroupChatWindow } from '../components/group-chat/GroupChatWindow'

interface GroupChatPageProps {
  conversationId: string
}

export function GroupChatPage({ conversationId }: GroupChatPageProps) {
  return <GroupChatWindow conversationId={conversationId} />
}
