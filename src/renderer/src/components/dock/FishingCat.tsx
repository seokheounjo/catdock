import type { AgentStatus, DockSize } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'
import fishingImg from '../../assets/cats/fishing.png'
import caughtImg from '../../assets/cats/caught.png'
import biteImg from '../../assets/cats/bite.png'

interface Props {
  status: AgentStatus
  recovering?: boolean
  size?: 'normal' | 'large'
  dockSize?: DockSize
}

const imgMap: Record<string, string> = {
  working: fishingImg,
  idle: caughtImg,
  error: biteImg
}

const animMap: Record<string, string> = {
  working: 'cat-fishing',
  idle: 'cat-caught',
  error: 'cat-bite'
}

// 독 크기 × 리더 여부에 따른 고양이 이미지 픽셀 크기
const CAT_SIZES: Record<DockSize, { normal: number; large: number }> = {
  small: { normal: 50, large: 58 },
  medium: { normal: 80, large: 90 },
  large: { normal: 100, large: 110 }
}

export function FishingCat({
  status,
  recovering = false,
  size = 'normal',
  dockSize = 'medium'
}: Props) {
  const { t } = useI18n()
  const src = imgMap[status] || caughtImg
  const anim = animMap[status] || 'cat-caught'
  const px = CAT_SIZES[dockSize][size]

  const altText = recovering
    ? t('dock.catRecovering')
    : {
        working: t('dock.catWorking'),
        idle: t('dock.catIdle'),
        error: t('dock.catError')
      }[status] || t('dock.catDefault')

  // 복구 중이면 pulse 애니메이션 추가
  const recoveringClass = recovering ? 'animate-pulse opacity-70' : ''

  return (
    <img
      src={src}
      alt={altText}
      draggable={false}
      style={{ width: px, height: px }}
      className={`${anim} object-contain pointer-events-none ${recoveringClass}`}
    />
  )
}
