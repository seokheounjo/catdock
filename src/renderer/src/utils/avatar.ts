import { createAvatar } from '@dicebear/core'
import { bottts, thumbs, funEmoji } from '@dicebear/collection'

const styles = { bottts, thumbs, 'fun-emoji': funEmoji } as Record<string, Parameters<typeof createAvatar>[0]>

export const AVATAR_STYLES = ['bottts', 'thumbs', 'fun-emoji'] as const
export type AvatarStyle = (typeof AVATAR_STYLES)[number]

export function generateAvatar(style: string, seed: string): string {
  const collection = styles[style] || bottts
  const avatar = createAvatar(collection, {
    seed,
    size: 64
  })
  return avatar.toDataUri()
}

export function getRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10)
}
