import { AgentEditor } from '../components/dock/AgentEditor'

interface EditorPageProps {
  agentId?: string
}

export function EditorPage({ agentId }: EditorPageProps) {
  const handleClose = () => {
    window.api.window.closeEditor()
  }

  return (
    <div className="w-screen h-screen bg-[#1e1e30] overflow-y-auto">
      <AgentEditor onClose={handleClose} editAgentId={agentId} />
    </div>
  )
}
