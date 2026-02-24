// 고양이 품종 목록 — AgentEditor에서 선택지로 사용

export const CAT_BREEDS = [
  'maine-coon',
  'scottish-fold',
  'russian-blue',
  'bengal',
  'siamese',
  'british-shorthair'
] as const

export type CatBreed = (typeof CAT_BREEDS)[number]

export const CAT_BREED_LABELS: Record<CatBreed, string> = {
  'maine-coon': 'Maine Coon',
  'scottish-fold': 'Scottish Fold',
  'russian-blue': 'Russian Blue',
  bengal: 'Bengal',
  siamese: 'Siamese',
  'british-shorthair': 'British Shorthair'
}
