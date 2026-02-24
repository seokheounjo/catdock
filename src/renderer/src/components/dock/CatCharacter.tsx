// 독 슬롯용 애니메이션 고양이 캐릭터 SVG
import { memo } from 'react'
import type { AgentStatus } from '../../../../shared/types'
import type { CatBreed } from '../../utils/cat-avatar'
import { useI18n } from '../../hooks/useI18n'

interface Props {
  breed: CatBreed | string
  status: AgentStatus
  size?: 'normal' | 'large'
}

interface BreedVisual {
  body: string
  bodyDark: string
  belly: string
  earInner: string
  eyeColor: string
  nose: string
  pattern: string // 추가 SVG 마크업
  tail: string
}

const BREED_VISUALS: Record<string, BreedVisual> = {
  'maine-coon': {
    body: '#c4956a',
    bodyDark: '#a07850',
    belly: '#e8c8a0',
    earInner: '#e8b090',
    eyeColor: '#5a9e5a',
    nose: '#d4877a',
    tail: '#a07850',
    pattern: `<path d="M32,48 Q40,44 48,48" stroke="#8c6840" stroke-width="1.5" fill="none" opacity="0.5"/>
              <path d="M30,52 Q40,47 50,52" stroke="#8c6840" stroke-width="1.2" fill="none" opacity="0.4"/>
              <path d="M40,40 L40,44" stroke="#8c6840" stroke-width="1.5" opacity="0.4"/>`
  },
  'scottish-fold': {
    body: '#f0c88a',
    bodyDark: '#d4a860',
    belly: '#f8e0b8',
    earInner: '#f5d8a8',
    eyeColor: '#d4a030',
    nose: '#e8a090',
    tail: '#d4a860',
    pattern: ''
  },
  'russian-blue': {
    body: '#8090a8',
    bodyDark: '#607080',
    belly: '#a8b8c8',
    earInner: '#a8b8c8',
    eyeColor: '#40b870',
    nose: '#90a0b0',
    tail: '#607080',
    pattern: ''
  },
  bengal: {
    body: '#d4a050',
    bodyDark: '#b08030',
    belly: '#e8c070',
    earInner: '#e8c070',
    eyeColor: '#50a050',
    nose: '#c48060',
    tail: '#b08030',
    pattern: `<circle cx="35" cy="50" r="2" fill="#6a4020" opacity="0.4"/>
              <circle cx="45" cy="46" r="1.8" fill="#6a4020" opacity="0.35"/>
              <circle cx="30" cy="55" r="1.5" fill="#6a4020" opacity="0.3"/>
              <circle cx="42" cy="55" r="2" fill="#6a4020" opacity="0.35"/>`
  },
  siamese: {
    body: '#f0e0d0',
    bodyDark: '#d8c8b8',
    belly: '#f8f0e8',
    earInner: '#604030',
    eyeColor: '#4090d0',
    nose: '#604030',
    tail: '#604030',
    pattern: `<ellipse cx="40" cy="70" rx="8" ry="4" fill="#604030" opacity="0.2"/>`
  },
  'british-shorthair': {
    body: '#9098a8',
    bodyDark: '#707888',
    belly: '#b0b8c8',
    earInner: '#b0b8c8',
    eyeColor: '#d08820',
    nose: '#a0889c',
    tail: '#707888',
    pattern: ''
  }
}

function getVisual(breed: string): BreedVisual {
  return BREED_VISUALS[breed] || BREED_VISUALS['maine-coon']
}

// 낚시 장면 (working)
function renderFishing(v: BreedVisual, breed: string): string {
  const isFolded = breed === 'scottish-fold'
  const earLeft = isFolded
    ? `<polygon points="24,26 18,10 36,22" fill="${v.body}"/>
       <path d="M24,26 Q18,18 26,14 Q32,18 36,22" fill="${v.bodyDark}" opacity="0.5"/>`
    : `<polygon points="24,26 16,4 38,22" fill="${v.body}"/>
       <polygon points="26,24 20,10 36,22" fill="${v.earInner}"/>`

  const earRight = isFolded
    ? `<polygon points="56,26 62,10 44,22" fill="${v.body}"/>
       <path d="M56,26 Q62,18 54,14 Q48,18 44,22" fill="${v.bodyDark}" opacity="0.5"/>`
    : `<polygon points="56,26 64,4 42,22" fill="${v.body}"/>
       <polygon points="54,24 60,10 44,22" fill="${v.earInner}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <!-- 배경 (투명) -->
    <!-- 낚시대 -->
    <line x1="55" y1="20" x2="72" y2="5" stroke="#8B6914" stroke-width="1.5" stroke-linecap="round">
      <animate attributeName="y2" values="5;3;5;7;5" dur="2.5s" repeatCount="indefinite"/>
    </line>
    <line x1="72" y1="5" x2="74" y2="35" stroke="#aaa" stroke-width="0.5" stroke-dasharray="2,1">
      <animate attributeName="y1" values="5;3;5;7;5" dur="2.5s" repeatCount="indefinite"/>
      <animate attributeName="y2" values="35;33;35;37;35" dur="2.5s" repeatCount="indefinite"/>
    </line>
    <!-- 물결 -->
    <path d="M0,70 Q10,67 20,70 Q30,73 40,70 Q50,67 60,70 Q70,73 80,70 L80,80 L0,80 Z" fill="#4a90d9" opacity="0.3">
      <animate attributeName="d" values="M0,70 Q10,67 20,70 Q30,73 40,70 Q50,67 60,70 Q70,73 80,70 L80,80 L0,80 Z;M0,70 Q10,73 20,70 Q30,67 40,70 Q50,73 60,70 Q70,67 80,70 L80,80 L0,80 Z;M0,70 Q10,67 20,70 Q30,73 40,70 Q50,67 60,70 Q70,73 80,70 L80,80 L0,80 Z" dur="3s" repeatCount="indefinite"/>
    </path>
    <!-- 꼬리 -->
    <path d="M20,55 Q10,45 8,35 Q6,28 12,25" fill="none" stroke="${v.tail}" stroke-width="3" stroke-linecap="round">
      <animate attributeName="d" values="M20,55 Q10,45 8,35 Q6,28 12,25;M20,55 Q12,45 10,35 Q8,30 14,22;M20,55 Q10,45 8,35 Q6,28 12,25" dur="4s" repeatCount="indefinite"/>
    </path>
    <!-- 몸통 -->
    <ellipse cx="38" cy="55" rx="18" ry="14" fill="${v.body}"/>
    <ellipse cx="38" cy="58" rx="12" ry="8" fill="${v.belly}" opacity="0.5"/>
    ${v.pattern}
    <!-- 앞발 -->
    <ellipse cx="48" cy="65" rx="5" ry="4" fill="${v.body}"/>
    <ellipse cx="30" cy="65" rx="5" ry="4" fill="${v.body}"/>
    <!-- 낚시대 잡는 앞발 -->
    <ellipse cx="53" cy="38" rx="4" ry="5" fill="${v.body}" transform="rotate(-20,53,38)"/>
    <!-- 머리 -->
    <ellipse cx="40" cy="34" rx="20" ry="18" fill="${v.body}"/>
    ${earLeft}
    ${earRight}
    <!-- 눈 -->
    <ellipse cx="34" cy="34" rx="4" ry="4.5" fill="white"/>
    <circle cx="35" cy="34" r="2.8" fill="${v.eyeColor}"/>
    <circle cx="35.5" cy="33.5" r="1.8" fill="#1a1a2e"/>
    <circle cx="36.5" cy="32.5" r="0.8" fill="white"/>
    <ellipse cx="46" cy="34" rx="4" ry="4.5" fill="white"/>
    <circle cx="47" cy="34" r="2.8" fill="${v.eyeColor}"/>
    <circle cx="47.5" cy="33.5" r="1.8" fill="#1a1a2e"/>
    <circle cx="48.5" cy="32.5" r="0.8" fill="white"/>
    <!-- 코 -->
    <ellipse cx="40" cy="39" rx="2" ry="1.5" fill="${v.nose}"/>
    <!-- 입 -->
    <path d="M38,41 Q40,43 40,41" fill="none" stroke="${v.bodyDark}" stroke-width="0.7"/>
    <path d="M40,41 Q40,43 42,41" fill="none" stroke="${v.bodyDark}" stroke-width="0.7"/>
    <!-- 수염 -->
    <line x1="20" y1="37" x2="32" y2="39" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <line x1="18" y1="40" x2="31" y2="41" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <line x1="48" y1="39" x2="60" y2="37" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <line x1="49" y1="41" x2="62" y2="40" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <!-- 낚시 찌 -->
    <circle cx="74" cy="35" r="2" fill="#ff4444">
      <animate attributeName="cy" values="35;33;35;37;35" dur="2.5s" repeatCount="indefinite"/>
    </circle>
  </svg>`
}

// 대기 장면 (idle) — 웅크리고 있는 고양이
function renderIdle(v: BreedVisual, breed: string): string {
  const isFolded = breed === 'scottish-fold'
  const earLeft = isFolded
    ? `<polygon points="24,20 18,4 36,16" fill="${v.body}"/>
       <path d="M24,20 Q18,12 26,8 Q32,12 36,16" fill="${v.bodyDark}" opacity="0.5"/>`
    : `<polygon points="24,20 16,0 38,16" fill="${v.body}"/>
       <polygon points="26,18 20,6 36,16" fill="${v.earInner}"/>`

  const earRight = isFolded
    ? `<polygon points="56,20 62,4 44,16" fill="${v.body}"/>
       <path d="M56,20 Q62,12 54,8 Q48,12 44,16" fill="${v.bodyDark}" opacity="0.5"/>`
    : `<polygon points="56,20 64,0 42,16" fill="${v.body}"/>
       <polygon points="54,18 60,6 44,16" fill="${v.earInner}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <!-- 꼬리 (느긋하게 흔들림) -->
    <path d="M60,52 Q68,42 72,35 Q76,28 72,22" fill="none" stroke="${v.tail}" stroke-width="3" stroke-linecap="round">
      <animate attributeName="d" values="M60,52 Q68,42 72,35 Q76,28 72,22;M60,52 Q70,42 74,35 Q78,30 74,24;M60,52 Q68,42 72,35 Q76,28 72,22" dur="3s" repeatCount="indefinite"/>
    </path>
    <!-- 몸통 (둥글게 웅크림) -->
    <ellipse cx="40" cy="55" rx="22" ry="16" fill="${v.body}">
      <animate attributeName="ry" values="16;16.5;16" dur="4s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="40" cy="58" rx="14" ry="8" fill="${v.belly}" opacity="0.4"/>
    ${v.pattern}
    <!-- 앞발 -->
    <ellipse cx="28" cy="64" rx="6" ry="4" fill="${v.body}"/>
    <ellipse cx="52" cy="64" rx="6" ry="4" fill="${v.body}"/>
    <!-- 머리 -->
    <ellipse cx="40" cy="30" rx="22" ry="20" fill="${v.body}">
      <animate attributeName="cy" values="30;29;30" dur="4s" repeatCount="indefinite"/>
    </ellipse>
    ${earLeft}
    ${earRight}
    <!-- 눈 (졸린 반쯤 감긴 눈) -->
    <ellipse cx="33" cy="30" rx="4" ry="2.5" fill="white"/>
    <ellipse cx="33" cy="30" rx="4" ry="2.5" fill="white" stroke="${v.bodyDark}" stroke-width="0.3"/>
    <circle cx="34" cy="30" r="2" fill="${v.eyeColor}"/>
    <circle cx="34.5" cy="29.5" r="1.2" fill="#1a1a2e"/>
    <ellipse cx="47" cy="30" rx="4" ry="2.5" fill="white"/>
    <ellipse cx="47" cy="30" rx="4" ry="2.5" fill="white" stroke="${v.bodyDark}" stroke-width="0.3"/>
    <circle cx="48" cy="30" r="2" fill="${v.eyeColor}"/>
    <circle cx="48.5" cy="29.5" r="1.2" fill="#1a1a2e"/>
    <!-- 눈 깜빡임 -->
    <rect x="28" y="27" width="12" height="6" fill="${v.body}" opacity="0">
      <animate attributeName="opacity" values="0;0;0;0;1;0;0;0;0;0" dur="5s" repeatCount="indefinite"/>
    </rect>
    <rect x="42" y="27" width="12" height="6" fill="${v.body}" opacity="0">
      <animate attributeName="opacity" values="0;0;0;0;1;0;0;0;0;0" dur="5s" repeatCount="indefinite"/>
    </rect>
    <!-- 코 -->
    <ellipse cx="40" cy="35" rx="2" ry="1.5" fill="${v.nose}"/>
    <!-- 입 (미소) -->
    <path d="M37,37 Q40,40 40,37" fill="none" stroke="${v.bodyDark}" stroke-width="0.7"/>
    <path d="M40,37 Q40,40 43,37" fill="none" stroke="${v.bodyDark}" stroke-width="0.7"/>
    <!-- 수염 -->
    <line x1="18" y1="33" x2="30" y2="35" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <line x1="16" y1="37" x2="29" y2="37" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <line x1="50" y1="35" x2="62" y2="33" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <line x1="51" y1="37" x2="64" y2="37" stroke="${v.bodyDark}" stroke-width="0.5" opacity="0.4"/>
    <!-- zzZ 수면 효과 -->
    <text x="62" y="16" fill="${v.bodyDark}" opacity="0.3" font-size="8" font-family="sans-serif">
      z
      <animate attributeName="y" values="16;10;6" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.3;0.2;0" dur="3s" repeatCount="indefinite"/>
    </text>
    <text x="66" y="10" fill="${v.bodyDark}" opacity="0.2" font-size="6" font-family="sans-serif">
      z
      <animate attributeName="y" values="10;4;0" dur="3s" repeatCount="indefinite" begin="1s"/>
      <animate attributeName="opacity" values="0.2;0.15;0" dur="3s" repeatCount="indefinite" begin="1s"/>
    </text>
  </svg>`
}

// 에러 장면 — 놀란 고양이
function renderError(v: BreedVisual, breed: string): string {
  const isFolded = breed === 'scottish-fold'
  const earLeft = isFolded
    ? `<polygon points="22,18 16,2 34,14" fill="${v.body}"/>
       <path d="M22,18 Q16,10 24,6 Q30,10 34,14" fill="${v.bodyDark}" opacity="0.5"/>`
    : `<polygon points="22,18 12,-2 38,14" fill="${v.body}"/>
       <polygon points="24,16 16,4 36,14" fill="${v.earInner}"/>`

  const earRight = isFolded
    ? `<polygon points="58,18 64,2 46,14" fill="${v.body}"/>
       <path d="M58,18 Q64,10 56,6 Q50,10 46,14" fill="${v.bodyDark}" opacity="0.5"/>`
    : `<polygon points="58,18 68,-2 42,14" fill="${v.body}"/>
       <polygon points="56,16 64,4 44,14" fill="${v.earInner}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <!-- 놀란 꼬리 (뻣뻣하게 서있음) -->
    <path d="M58,50 Q65,38 68,25 Q70,15 66,8" fill="none" stroke="${v.tail}" stroke-width="4" stroke-linecap="round">
      <animate attributeName="d" values="M58,50 Q65,38 68,25 Q70,15 66,8;M58,50 Q63,38 66,25 Q68,15 64,8;M58,50 Q65,38 68,25 Q70,15 66,8" dur="0.3s" repeatCount="indefinite"/>
    </path>
    <!-- 몸통 (약간 부풀어) -->
    <ellipse cx="40" cy="55" rx="22" ry="16" fill="${v.body}">
      <animate attributeName="rx" values="22;23;22" dur="0.2s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="40" cy="58" rx="14" ry="8" fill="${v.belly}" opacity="0.4"/>
    <!-- 앞발 (들어올림) -->
    <ellipse cx="26" cy="58" rx="5" ry="6" fill="${v.body}" transform="rotate(-15,26,58)"/>
    <ellipse cx="54" cy="58" rx="5" ry="6" fill="${v.body}" transform="rotate(15,54,58)"/>
    <!-- 머리 -->
    <ellipse cx="40" cy="28" rx="22" ry="20" fill="${v.body}">
      <animate attributeName="cx" values="40;39;41;40" dur="0.15s" repeatCount="indefinite"/>
    </ellipse>
    ${earLeft}
    ${earRight}
    <!-- 큰 놀란 눈 -->
    <circle cx="33" cy="28" r="6" fill="white" stroke="${v.bodyDark}" stroke-width="0.5"/>
    <circle cx="34" cy="28" r="4" fill="${v.eyeColor}"/>
    <circle cx="34.5" cy="27" r="2.5" fill="#1a1a2e"/>
    <circle cx="35.5" cy="26" r="1" fill="white"/>
    <circle cx="47" cy="28" r="6" fill="white" stroke="${v.bodyDark}" stroke-width="0.5"/>
    <circle cx="48" cy="28" r="4" fill="${v.eyeColor}"/>
    <circle cx="48.5" cy="27" r="2.5" fill="#1a1a2e"/>
    <circle cx="49.5" cy="26" r="1" fill="white"/>
    <!-- 코 -->
    <ellipse cx="40" cy="34" rx="2" ry="1.5" fill="${v.nose}"/>
    <!-- 입 (벌림) -->
    <ellipse cx="40" cy="38" rx="3" ry="2" fill="#2a1a1a" opacity="0.6"/>
    <!-- 수염 (뻣뻣하게) -->
    <line x1="15" y1="30" x2="28" y2="33" stroke="${v.bodyDark}" stroke-width="0.6" opacity="0.5"/>
    <line x1="13" y1="35" x2="27" y2="35" stroke="${v.bodyDark}" stroke-width="0.6" opacity="0.5"/>
    <line x1="52" y1="33" x2="65" y2="30" stroke="${v.bodyDark}" stroke-width="0.6" opacity="0.5"/>
    <line x1="53" y1="35" x2="67" y2="35" stroke="${v.bodyDark}" stroke-width="0.6" opacity="0.5"/>
    <!-- ! 마크 -->
    <text x="62" y="12" fill="#ff4444" opacity="0.8" font-size="14" font-weight="bold" font-family="sans-serif">
      !
      <animate attributeName="opacity" values="0.8;0.4;0.8" dur="0.5s" repeatCount="indefinite"/>
    </text>
  </svg>`
}

export const CatCharacter = memo(function CatCharacter({ breed, status, size = 'normal' }: Props) {
  const { t } = useI18n()
  const v = getVisual(breed)
  const sizeClass = size === 'large' ? 'w-[100px] h-[100px]' : 'w-[90px] h-[90px]'

  let svgContent: string
  try {
    switch (status) {
      case 'working':
        svgContent = renderFishing(v, breed)
        break
      case 'error':
        svgContent = renderError(v, breed)
        break
      default:
        svgContent = renderIdle(v, breed)
    }
  } catch (e) {
    console.error('[CatCharacter] SVG render error:', e)
    svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="40" r="30" fill="#999"/></svg>'
  }

  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`

  const altText =
    {
      working: t('dock.catWorking'),
      idle: t('dock.catIdle'),
      error: t('dock.catError')
    }[status] || t('dock.catDefault')

  return (
    <img
      src={dataUri}
      alt={altText}
      draggable={false}
      className={`${sizeClass} object-contain pointer-events-none`}
    />
  )
})
