# Claude Code Monitor v1 에이전트 팀 운영안

- 작성일: 2026-03-08
- 기준 문서:
  - `docs/prd-v1.md`
  - `docs/ia-v1.md`
  - `docs/backlog-v1.md`
  - `docs/issues-v1/issue-order.md`

## 1. 목적

v1 이슈를 병렬로 처리하되, 역할 중복과 품질 저하를 막기 위해 에이전트 팀 구조를 정의한다.
핵심 원칙은 `한 명의 리드`, `명확한 책임 경계`, `리뷰 게이트`, `짧은 통합 주기`다.

## 2. 모델 선정 기준

모델 선정은 2026-03-08 기준 공식 문서를 바탕으로 했다.

- OpenAI `gpt-5.2`
  - OpenAI는 `GPT-5.2`를 "coding and agentic tasks"에 가장 적합한 플래그십 모델로 소개한다.
- OpenAI `gpt-5.2-codex`
  - OpenAI는 `GPT-5.2-Codex`를 long-horizon agentic coding task에 최적화된 코딩 모델로 설명한다.
- OpenAI `gpt-5-mini`
  - OpenAI는 `GPT-5 mini`를 잘 정의된 작업에 적합한 빠르고 비용 효율적인 모델로 설명한다.
- OpenAI `gpt-5.2-pro`
  - OpenAI는 `GPT-5.2 pro`를 더 오래 생각해 더 정밀한 답을 내는 상위 변형으로 설명한다.
- Anthropic `Claude Opus 4.1`
  - Anthropic은 `Claude Opus 4.1`을 가장 강력하고 복잡한 추론과 고급 코딩에 적합한 모델로 설명한다.
- Anthropic `Claude Sonnet 4.6`
  - Anthropic은 `Claude Sonnet 4.6`을 코딩, 에이전트 계획, 디자인까지 포함해 개선된 Sonnet 계열의 고성능 모델로 소개한다.

## 3. 추천 팀 구성

### 3.1 혼합 팀 권장안

이 프로젝트에는 아래 구성이 가장 실용적이다.

| Agent | 역할 | 권장 모델 | 이유 |
|---|---|---|---|
| Lead PM | 우선순위, 범위, 이슈 분해, 최종 의사결정 | `gpt-5.2` | 범용 추론과 에이전트 작업 밸런스가 좋다 |
| Architect Reviewer | 상태 모델, 경계 정의, 설계 리뷰, 위험 점검 | `claude-opus-4.1` | 복잡한 설계 검토와 고급 코딩 판단에 유리하다 |
| Backend Builder | 수집기, 상태 계산, API, 데이터 모델 구현 | `gpt-5.2-codex` | 장기 코딩 작업과 반복 수정에 적합하다 |
| Frontend Builder | 정보구조 반영, 세션 UX, 카드, alerts, 빈 상태 구현 | `claude-sonnet-4.6` | UI/UX와 코딩/계획 균형이 좋다 |
| QA Ops | 연결성, 회귀, 성능 체크, 이슈 재현, 검증 루틴 | `gpt-5-mini` | 규칙 기반 점검과 빠른 반복에 비용 효율적이다 |

### 3.2 단일 공급자 대안

OpenAI만 쓸 경우:

- Lead PM: `gpt-5.2`
- Architect Reviewer: `gpt-5.2-pro`
- Backend Builder: `gpt-5.2-codex`
- Frontend Builder: `gpt-5.2`
- QA Ops: `gpt-5-mini`

Anthropic만 쓸 경우:

- Lead PM: `claude-sonnet-4.6`
- Architect Reviewer: `claude-opus-4.1`
- Backend Builder: `claude-opus-4.1`
- Frontend Builder: `claude-sonnet-4.6`
- QA Ops: `claude-haiku-4.5`

위 Anthropic-only 구성의 `Claude Haiku 4.5` 선택은 Anthropic 공식 소개 페이지의 "fastest, most cost-efficient" 설명에 근거한 운영상 추론이다.

## 4. 역할 정의

### Lead PM

책임:

- 범위와 우선순위 결정
- 이슈 생성과 순서 관리
- 배치별 완료 기준 확인
- 에이전트 간 충돌 해결

산출물:

- 작업 브리프
- 우선순위 변경 메모
- 승인 또는 보류 결정

### Architect Reviewer

책임:

- 상태 모델 정의
- API 및 데이터 계약 검토
- refactor와 performance 변경 리뷰
- 회귀 위험 식별

산출물:

- 설계 메모
- 리뷰 결과
- 위험 목록

### Backend Builder

책임:

- collector, state, http, types, persistence 구현
- 탐지 규칙과 계산 로직 구현
- 세션/alert 연결용 데이터 제공

산출물:

- 코드 변경
- 테스트
- 구현 메모

### Frontend Builder

책임:

- 홈 화면 정보 우선순위 반영
- Sessions Workspace, Needs Attention, alerts 흐름 구현
- 빈 상태와 카드 UX 정리

산출물:

- UI 변경
- 상호작용 구현
- 화면 기준 메모

### QA Ops

책임:

- 연결 상태와 회귀 점검
- 성능 시나리오 검증
- 수동 검증 루틴 정리
- 이슈 재현과 triage

산출물:

- 체크리스트
- 재현 절차
- 검증 결과

## 5. 현재 이슈 기준 담당 배정

### Batch 1

| Issue | 제목 | 주담당 | 보조 |
|---|---|---|---|
| #117 | `docs: 제품명과 주요 UI 라벨 통일하기` | Lead PM | Frontend Builder |
| #118 | `feat: 세션 상태 모델과 위험도 규칙 정의하기` | Architect Reviewer | Lead PM, Backend Builder |
| #119 | `fix: 연결 끊김과 재연결 상태 UX 보강하기` | QA Ops | Frontend Builder, Backend Builder |

### Batch 2

| Issue | 제목 | 주담당 | 보조 |
|---|---|---|---|
| #120 | `feat: 상단 요약 카드를 세션 중심 지표로 개편하기` | Frontend Builder | Lead PM |
| #121 | `feat: Needs Attention 섹션으로 문제 세션 노출하기` | Frontend Builder | Backend Builder, Architect Reviewer |
| #122 | `refactor: Sessions Workspace를 메인 진단 영역으로 재구성하기` | Frontend Builder | Architect Reviewer |
| #123 | `feat: alert에서 session detail로 바로 열기` | Backend Builder | Frontend Builder |

### Batch 3

| Issue | 제목 | 주담당 | 보조 |
|---|---|---|---|
| #124 | `feat: 첫 실행 빈 상태와 수집 경로 안내 추가하기` | Frontend Builder | QA Ops |
| #125 | `feat: stuck 세션과 cost spike 규칙 탐지하기` | Backend Builder | Architect Reviewer |
| #126 | `refactor: workflow와 그래프를 보조 분석 영역으로 정리하기` | Frontend Builder | Architect Reviewer |
| #127 | `feat: 세션 정렬과 필터를 위험도 중심으로 개선하기` | Backend Builder | Frontend Builder |
| #128 | `fix: 대량 이벤트 상황의 응답성 확보하기` | QA Ops | Backend Builder, Architect Reviewer |

### Batch 4

| Issue | 제목 | 주담당 | 보조 |
|---|---|---|---|
| #129 | `feat: 세션 내부 계층형 agent 트리 추가하기` | Frontend Builder | Architect Reviewer |
| #130 | `feat: 사용자 정의 alert 규칙 추가하기` | Lead PM | Backend Builder |
| #131 | `feat: 세션 데이터 export 추가하기` | Backend Builder | Lead PM |

## 6. 실제 운영 순서

### Sprint 1

- `#117`
- `#118`
- `#119`

목표:

- 제품명, 상태 모델, 연결 신뢰도를 먼저 고정한다.

### Sprint 2

- `#120`
- `#121`
- `#122`
- `#123`

목표:

- 첫 화면의 핵심 진단 흐름을 완성한다.

### Sprint 3

- `#124`
- `#125`
- `#126`
- `#127`
- `#128`

목표:

- 완성도, 탐지 규칙, 성능을 마감한다.

### Sprint 4

- `#129`
- `#130`
- `#131`

목표:

- post-v1 확장 기능을 별도 트랙으로 관리한다.

## 7. 협업 프로토콜

1. Lead PM이 이슈 브리프를 5줄 이내로 정리한다.
2. 주담당 에이전트가 구현 또는 설계 초안을 만든다.
3. Architect Reviewer가 구조적 위험을 본다.
4. QA Ops가 테스트와 회귀를 확인한다.
5. Lead PM이 merge 또는 다음 작업을 결정한다.

## 8. 작업 단위 규칙

- 한 에이전트는 한 번에 한 이슈만 `in_progress`
- 상태 모델, 성능, refactor는 Reviewer 승인이 있어야 다음 이슈로 진행
- UI 텍스트 변경도 `#117` 브랜드 기준을 따라야 함
- 배치 경계를 넘어가는 구현은 Lead PM 승인 없이는 하지 않음

## 9. 핸드오프 템플릿

각 에이전트는 작업 종료 시 아래 형식으로 남긴다.

```md
## Summary
- 무엇을 바꿨는지

## Decisions
- 어떤 기준으로 판단했는지

## Risks
- 아직 남은 위험

## Tests
- 실행한 테스트와 결과

## Next
- 다음 에이전트가 바로 할 일
```

## 10. 이 프로젝트에 대한 최종 추천

이 프로젝트는 `혼합 팀 권장안`이 가장 적합하다.

- 리드: `gpt-5.2`
- 리뷰/설계: `claude-opus-4.1`
- 백엔드 구현: `gpt-5.2-codex`
- 프론트엔드 구현: `claude-sonnet-4.6`
- QA/운영: `gpt-5-mini`

이 조합은 `복잡한 설계 판단`, `장기 코딩`, `UI 반영`, `빠른 검증`을 서로 다른 강점으로 분리할 수 있다.

## 11. 출처

- OpenAI Models overview: https://platform.openai.com/docs/models
- OpenAI GPT-5.2: https://platform.openai.com/docs/models/gpt-5.2
- OpenAI GPT-5.2-Codex: https://platform.openai.com/docs/models/gpt-5.2-codex
- OpenAI GPT-5 mini: https://platform.openai.com/docs/models/gpt-5-mini
- OpenAI GPT-5.2 pro: https://platform.openai.com/docs/models/gpt-5.2-pro
- OpenAI GPT-5.2 guide: https://platform.openai.com/docs/guides/latest-model
- Anthropic models overview: https://docs.anthropic.com/en/docs/about-claude/models/overview
- Anthropic all models: https://docs.anthropic.com/en/docs/about-claude/models/all-models
- Anthropic Sonnet 4.6 announcement: https://www.anthropic.com/news/claude-sonnet-4-6
- Anthropic Haiku 4.5: https://www.anthropic.com/claude/haiku
