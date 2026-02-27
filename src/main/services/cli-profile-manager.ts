// CLI 프로필 매니저 — 다중 계정 CRUD + 라운드 로빈 할당
import { v4 as uuid } from 'uuid'
import { AgentConfig, CliProfile, CliProvider } from '../../shared/types'
import * as store from './store'

// ── 라운드 로빈 카운터 (런타임 전용) ──
const profileUsageCount = new Map<string, number>()

// ── CRUD ──

export function getProfiles(): CliProfile[] {
  const settings = store.getSettings()
  return settings.cliProfiles ?? []
}

export function getProfilesForProvider(provider: CliProvider): CliProfile[] {
  return getProfiles().filter((p) => p.provider === provider)
}

export function createProfile(
  profile: Omit<CliProfile, 'id' | 'createdAt'>
): CliProfile {
  const newProfile: CliProfile = {
    ...profile,
    id: uuid(),
    createdAt: Date.now()
  }

  const profiles = getProfiles()

  // 첫 프로필이면 기본으로 설정
  if (profiles.filter((p) => p.provider === newProfile.provider).length === 0) {
    newProfile.isDefault = true
  }

  // 새 프로필이 default면 기존 default 해제
  if (newProfile.isDefault) {
    for (const p of profiles) {
      if (p.provider === newProfile.provider) {
        p.isDefault = false
      }
    }
  }

  profiles.push(newProfile)
  store.updateSettings({ cliProfiles: profiles })
  return newProfile
}

export function updateProfile(
  id: string,
  updates: Partial<Omit<CliProfile, 'id' | 'createdAt'>>
): CliProfile | null {
  const profiles = getProfiles()
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx < 0) return null

  const profile = profiles[idx]
  Object.assign(profile, updates)

  // default 변경 시 다른 프로필 해제
  if (updates.isDefault) {
    for (let i = 0; i < profiles.length; i++) {
      if (i !== idx && profiles[i].provider === profile.provider) {
        profiles[i].isDefault = false
      }
    }
  }

  store.updateSettings({ cliProfiles: profiles })
  return profile
}

export function deleteProfile(id: string): boolean {
  const profiles = getProfiles()
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx < 0) return false

  const removed = profiles.splice(idx, 1)[0]
  profileUsageCount.delete(id)

  // 삭제된 게 default였으면 같은 프로바이더 첫 번째를 default로
  if (removed.isDefault) {
    const sameProvider = profiles.find((p) => p.provider === removed.provider)
    if (sameProvider) sameProvider.isDefault = true
  }

  store.updateSettings({ cliProfiles: profiles })
  return true
}

// ── 할당 ──

export function resolveProfileForAgent(config: AgentConfig): CliProfile | null {
  const provider = config.cliProvider ?? 'claude'
  const profiles = getProfilesForProvider(provider)

  if (profiles.length === 0) return null

  // 지정된 프로필 ID가 있으면 해당 프로필 반환
  if (config.cliProfileId && config.cliProfileId !== 'auto') {
    return profiles.find((p) => p.id === config.cliProfileId) ?? null
  }

  // 'auto' 또는 미지정 → 라운드 로빈 (최소 사용 프로필)
  let minUsage = Infinity
  let bestProfile: CliProfile | null = null

  for (const p of profiles) {
    const usage = profileUsageCount.get(p.id) ?? 0
    if (usage < minUsage) {
      minUsage = usage
      bestProfile = p
    }
  }

  if (bestProfile) {
    profileUsageCount.set(bestProfile.id, (profileUsageCount.get(bestProfile.id) ?? 0) + 1)
  }

  return bestProfile
}

// ── 환경변수 빌드 ──

export function buildProfileEnv(
  baseEnv: NodeJS.ProcessEnv,
  profile: CliProfile
): NodeJS.ProcessEnv {
  const env = { ...baseEnv }

  // Claude: CLAUDE_CONFIG_DIR로 계정 분리
  if (profile.provider === 'claude' && profile.configDir) {
    env['CLAUDE_CONFIG_DIR'] = profile.configDir
  }

  // envOverrides 병합
  if (profile.envOverrides) {
    Object.assign(env, profile.envOverrides)
  }

  return env
}

// ── 프로필별 에이전트 사용 수 ──

export function getProfileUsage(): Record<string, number> {
  const agents = store.getAgents()
  const usage: Record<string, number> = {}

  for (const agent of agents) {
    if (agent.cliProfileId && agent.cliProfileId !== 'auto') {
      usage[agent.cliProfileId] = (usage[agent.cliProfileId] ?? 0) + 1
    }
  }

  return usage
}
