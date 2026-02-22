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

  // 상태에 따른 적절한 alt 텍스트
  const altText = {
    'working': '작업 중인 낚시 고양이',
    'idle': '대기 중인 낚시 고양이',
    'error': '오류 상태의 낚시 고양이'
  }[status] || '낚시 고양이'

  return (
    <img
      src={src}
      alt={altText}
      draggable={false}
      className={`${anim} w-[90px] h-[90px] object-contain pointer-events-none`}
    />
  )
}
