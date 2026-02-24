import { CAT_BREEDS, type CatBreed } from './cat-avatar'

export const AVATAR_STYLES = [...CAT_BREEDS] as readonly string[]
export type AvatarStyle = CatBreed

// RoboHash set4 (고양이) — 외부 서비스에서 seed별 고유 고양이 아바타 생성
export function generateAvatar(style: string, seed: string): string {
  const key = encodeURIComponent(`${style}-${seed}`)
  return `https://robohash.org/${key}?set=set4&size=200x200&bgset=bg2`
}

export function getRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10)
}
