# CatDock 운영 가이드

에이전트 예산 관리, 승인 게이트, 활동 트레이싱 운영 매뉴얼.

---

## 1. 예산 관리 (Budget Control)

### 개요

모든 에이전트는 Claude CLI 호출 시 API 비용이 발생한다. 예산 관리 시스템은 **에이전트별 월 사용량을 추적**하고, 한도 초과 시 자동으로 작업을 중지한다.

### 비용 추적 흐름

```
에이전트 CLI 호출 → Claude API 응답 (total_cost_usd) → stream-parser 파싱
    → agent-manager (런타임 누적) + store (영속 저장)
        → 예산 임계치 체크 → 경고 또는 중지
```

### 설정 방법

#### 전역 기본 예산 (모든 에이전트에 적용)

설정 > 글로벌 설정에서:

| 설정 | 설명 | 기본값 |
|---|---|---|
| `defaultBudgetLimitUsd` | 에이전트 기본 월 예산 (USD) | 미설정 (무제한) |
| `defaultBudgetWarningPercent` | 경고 알림 임계치 (%) | 80 |

#### 에이전트별 예산 (개별 오버라이드)

에이전트 편집에서:

| 설정 | 설명 |
|---|---|
| `budgetLimitUsd` | 이 에이전트의 월 예산. 설정 시 전역 기본값 대신 적용. |
| `budgetWarningPercent` | 이 에이전트의 경고 임계치. |

#### 예시 구성

```
전역 기본: $5.00/월, 경고 80%

Director:     $10.00/월 (위임 종합 등 비용이 높으므로 별도 설정)
프론트엔드팀장: $5.00/월 (전역 기본 사용)
백엔드팀장:   $5.00/월 (전역 기본 사용)
팀원들:       $3.00/월 (개별 설정)
```

### 동작 방식

#### 정상 범위 (0~79%)
- 아무 제한 없이 정상 작업.

#### 경고 (80~99%)
- 채팅에 시스템 메시지 표시: `💰 예산 경고: $4.00 / $5.00 (80%)`
- 활동 로그에 `budget-warning` 이벤트 기록.
- **작업은 계속 가능.**

#### 초과 (100%+)
- 채팅에 시스템 메시지 표시: `⚠️ 월 예산 초과`
- 에이전트 상태가 `error`로 전환.
- **이후 모든 메시지가 차단됨**: `🚫 예산 초과로 작업이 차단되었습니다.`
- 활동 로그에 `budget-exceeded` 이벤트 기록.

#### 차단 해제 방법
1. **에이전트 예산 늘리기** — 에이전트 설정에서 `budgetLimitUsd` 상향.
2. **다음 달 대기** — 월이 바뀌면 월별 비용이 자동 리셋 (총 누적 비용은 유지).
3. **전역 기본 예산 제거** — `defaultBudgetLimitUsd`를 삭제하면 무제한으로 전환.

### 비용 데이터 구조

```json
// config.json 내 agentCosts
{
  "agentCosts": {
    "agent-id-1": {
      "totalUsd": 12.50,    // 전체 누적 (리셋되지 않음)
      "monthlyUsd": 3.20,   // 이번 달 사용량
      "monthKey": "2026-03"  // 현재 월 키
    }
  }
}
```

- `totalUsd`: 에이전트 생성 이후 전체 누적 비용. 절대 리셋되지 않음.
- `monthlyUsd`: 이번 달 사용량. 월이 바뀌면 0으로 리셋.
- `monthKey`: 마지막 비용이 기록된 월. `YYYY-MM` 형식.

### 비용 확인

- **UI**: 에이전트 카드에 `costTotal` 표시 (런타임).
- **API**: `window.api.cost.getForAgent(agentId)` → `{ totalUsd, monthlyUsd }`
- **전체**: `window.api.cost.getAll()` → 모든 에이전트 비용 맵

---

## 2. 승인 게이트 (Approval Gate)

### 개요

에이전트가 자율적으로 작업을 위임하거나 새 에이전트를 생성할 때, **사용자에게 먼저 승인을 요청**할 수 있다. 이를 통해 불필요한 API 호출과 예상치 못한 에이전트 증식을 방지한다.

### 설정 방법

설정 > 글로벌 설정에서:

| 설정 | 설명 | 기본값 |
|---|---|---|
| `requireDelegationApproval` | 작업 위임 시 사용자 승인 필요 | `false` (즉시 실행) |
| `requireAgentSpawnApproval` | 임시 에이전트 생성 시 승인 필요 | `false` (즉시 생성) |

### 승인 대상

| 액션 | 승인 필요 조건 | 설명 |
|---|---|---|
| 작업 위임 | `requireDelegationApproval = true` | Director/Leader가 팀원에게 작업을 위임할 때 |
| 에이전트 생성 | `requireAgentSpawnApproval = true` | 에이전트가 임시 에이전트를 스폰할 때 |
| 예산 오버라이드 | 항상 | (향후 구현) 예산 초과 상태에서 강제 실행 시 |

### 승인 흐름

```
에이전트가 위임/생성 시도
    → approval-gate가 승인 요청 생성
        → 렌더러에 'approval:request' 이벤트 브로드캐스트
            → 사용자가 채팅 UI에서 승인/거부
                → 'approval:respond'로 응답
                    → 승인 시 작업 진행 / 거부 시 중단
```

### 타임아웃

- **120초** 내 응답이 없으면 **자동 거부**.
- 거부된 위임은 활동 로그에 `approval-resolved (거부)` 이벤트로 기록.

### 승인 요청 정보

사용자에게 보여지는 승인 요청 내용:

```
📋 승인 요청
타입: 작업 위임
요청자: Director (총괄)
설명: Director이 3건 작업을 위임하려 합니다 → 프론트엔드팀장, 백엔드팀장, 김설계
[승인] [거부]
```

### 운영 권장 사항

| 상황 | 권장 설정 |
|---|---|
| **초기 세팅 / 학습 단계** | 둘 다 `true` — 모든 위임과 생성을 직접 확인 |
| **안정적 운영** | `requireDelegationApproval: false`, `requireAgentSpawnApproval: true` |
| **완전 자동화** | 둘 다 `false` — 기존 동작과 동일 (예산으로만 통제) |

### API

```typescript
// 대기 중인 승인 목록
window.api.approval.getPending()

// 승인/거부 응답
window.api.approval.respond(requestId, true)  // 승인
window.api.approval.respond(requestId, false) // 거부
```

---

## 3. 활동 트레이싱 (Activity Tracing)

### 개요

모든 에이전트의 행동 — 메시지, 도구 호출, 위임, 보고, 예산 이벤트, 승인 — 이 중앙 활동 로그에 기록된다. 대시보드의 Activity Feed에서 실시간으로 확인할 수 있다.

### 활동 타입

| 타입 | 아이콘 | 설명 |
|---|---|---|
| `message` | 💬 | 에이전트 메시지 수신 |
| `tool-use` | 🔧 | 도구 호출 (파일 편집, 코드 실행 등) |
| `error` | ❌ | 에이전트 오류 발생 |
| `status-change` | 🔄 | 상태 변경 (idle/working/error) |
| `agent-created` | ➕ | 새 에이전트 생성 |
| `agent-deleted` | ➖ | 에이전트 삭제 |
| `task-delegated` | 📋 | 작업 위임 |
| `upward-report` | 📤 | 상향 보고 (멤버 → 리더) |
| `chain-report` | 🔗 | 체인 보고 (리더 → 디렉터) |
| `mcp-configured` | 🔌 | MCP 서버 설정 변경 |
| `budget-warning` | 💰 | 예산 경고 (임계치 초과) |
| `budget-exceeded` | 🚫 | 예산 초과 (작업 중지) |
| `approval-requested` | 📝 | 승인 요청 발생 |
| `approval-resolved` | ✅ | 승인 처리 완료 (승인/거부) |

### 도구 호출 트레이싱 상세

도구 호출 시 기록되는 메타데이터:

```json
{
  "type": "tool-use",
  "agentName": "프론트엔드팀장",
  "description": "Write 사용",
  "metadata": {
    "toolName": "Write",
    "toolInput": "src/components/Header.tsx (첫 80자)",
    "currentCostUsd": 0.0234
  }
}
```

### 활동 로그 활용

- **비용 감사**: `budget-warning` / `budget-exceeded` 이벤트로 어떤 에이전트가 비용을 많이 쓰는지 추적.
- **위임 추적**: `task-delegated` + `approval-requested` / `approval-resolved`로 위임 경로 파악.
- **도구 사용 분석**: `tool-use` 이벤트의 `toolName` 필드로 어떤 도구가 가장 많이 호출되는지 확인.
- **오류 패턴**: `error` 이벤트의 빈도와 에이전트별 분포로 문제 에이전트 식별.

---

## 4. API 비용 최적화 (자동 적용)

다음 최적화는 자동으로 적용되며 별도 설정이 필요 없다.

### 상향 보고 스마트 생략

| 조건 | 동작 |
|---|---|
| 응답이 150자 미만 | 보고 생략 (단순 확인/인사) |
| QUESTION 블록 답변 | 보고 생략 (UI 상호작용) |
| 작업 지표 없이 500자 미만 | 보고 생략 (정보성 답변) |
| 작업 지표 있고 긴 응답 | **보고 실행** (실질적 작업) |

### 보고 쿨다운

- 같은 에이전트가 **60초 이내** 재보고 시 자동 생략.
- 연속 메시지 시 체인 보고(멤버→리더→디렉터)가 폭주하는 것을 방지.

### 위임 종합 생략

- 위임 결과가 **2건 이하 + 각 200자 미만**이면 synthesis CLI 호출 생략.
- 간단한 결과를 로컬에서 조합하여 반환.

### 절감 효과

| 시나리오 | 기존 | 최적화 후 |
|---|---|---|
| 멤버에게 간단한 질문 | 3 CLI (멤버+리더보고+디렉터체인) | **1 CLI** |
| 60초 내 연속 3개 메시지 | 9 CLI | **3 CLI** |
| 간단한 위임 2건 | 4 CLI (2에이전트+종합) | **3 CLI** (종합 생략) |

---

## 5. 빠른 시작 체크리스트

### 최소 설정 (권장)

1. **전역 예산 설정**: `defaultBudgetLimitUsd: 5.00` — 에이전트당 월 $5
2. **위임 승인 활성화**: `requireDelegationApproval: true` — 처음에는 모든 위임 확인
3. **에이전트 생성 승인**: `requireAgentSpawnApproval: true` — 자동 에이전트 증식 방지

### 안정화 후

1. 위임 승인을 `false`로 전환 — 예산으로만 통제
2. Director 예산을 별도로 $10~20으로 상향 — 종합 작업 비용 고려
3. Activity Feed에서 비용 패턴 모니터링 후 필요 시 에이전트별 예산 조정

### 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 에이전트가 갑자기 멈춤 | 월 예산 초과 | 에이전트 예산 늘리기 또는 다음 달 대기 |
| 위임이 진행되지 않음 | 승인 게이트 대기 중 | UI에서 승인 요청 확인 후 승인 |
| 위임 자동 거부됨 | 120초 타임아웃 | 앱을 포그라운드에서 확인, 필요 시 승인 비활성화 |
| 비용이 빠르게 증가 | 연쇄 위임 + 보고 | 예산 한도 설정 + 보고 최적화 자동 적용 확인 |
