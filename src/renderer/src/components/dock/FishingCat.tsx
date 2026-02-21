import type { AgentStatus } from '../../../../shared/types'
import fishingImg from '../../assets/cats/fishing.png'
import caughtImg from '../../assets/cats/caught.png'
import biteImg from '../../assets/cats/bite.png'

interface Props { status: AgentStatus }

const imgMap: Record<string, string> = {
  working: fishingImg,
  idle: caughtImg,
  error: biteImg,
}

const animMap: Record<string, string> = {
  working: 'cat-fishing',
  idle: 'cat-caught',
  error: 'cat-bite',
}

export function FishingCat({ status }: Props) {
  const src = imgMap[status] || caughtImg
  const anim = animMap[status] || 'cat-caught'

  return (
    <img
      src={src}
      alt="fishing cat"
      draggable={false}
      className={anim}
      style={{ width: 90, height: 90, objectFit: 'contain', pointerEvents: 'none' }}
    />
  )
}
