import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AgentConfig } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'

interface GroupStreamingTextProps {
  content: string
  agentId: string | null
  agentName: string | null
  agents: Map<string, AgentConfig>
}

export function GroupStreamingText({ content, agentId, agentName, agents }: GroupStreamingTextProps) {
  const agent = agentId ? agents.get(agentId) : null

  if (!content) {
    return (
      <div className="message-enter flex justify-start px-4 py-1 gap-2">
        <div className="shrink-0 mt-1">
          {agent ? (
            <img
              src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
              alt={agentName || ''}
              className="w-7 h-7 rounded-full"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/10" />
          )}
        </div>
        <div>
          <div className="text-[11px] text-white/50 mb-0.5 ml-1">
            {agentName || 'Agent'}
            {agent && <span className="text-white/30 ml-1">({agent.role})</span>}
          </div>
          <div className="bg-bubble-assistant rounded-2xl rounded-tl-md px-4 py-3 border border-white/5">
            <div className="flex gap-1.5 items-center h-4">
              <div className="typing-dot w-2 h-2 rounded-full bg-accent/60" />
              <div className="typing-dot w-2 h-2 rounded-full bg-accent/60" />
              <div className="typing-dot w-2 h-2 rounded-full bg-accent/60" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="message-enter flex justify-start px-4 py-1 gap-2">
      <div className="shrink-0 mt-1">
        {agent ? (
          <img
            src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
            alt={agentName || ''}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/10" />
        )}
      </div>
      <div className="max-w-[80%]">
        <div className="text-[11px] text-white/50 mb-0.5 ml-1">
          {agentName || 'Agent'}
          {agent && <span className="text-white/30 ml-1">({agent.role})</span>}
        </div>
        <div className="bg-bubble-assistant rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-white/90 border border-white/5">
          <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-accent [&_code]:text-xs [&_p]:my-1.5">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
          <div className="flex gap-1 items-center mt-1.5">
            <div className="typing-dot w-1.5 h-1.5 rounded-full bg-accent/50" />
            <div className="typing-dot w-1.5 h-1.5 rounded-full bg-accent/50" />
            <div className="typing-dot w-1.5 h-1.5 rounded-full bg-accent/50" />
          </div>
        </div>
      </div>
    </div>
  )
}
