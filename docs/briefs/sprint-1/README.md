# Sprint 1 Briefs

- 작성일: 2026-03-08
- 기준 문서:
  - `/Users/yunseojin/claude-code-monitor/docs/agent-team-v1.md`
  - `/Users/yunseojin/claude-code-monitor/docs/issues-v1/issue-order.md`
- Sprint 범위:
  - `#117 docs: 제품명과 주요 UI 라벨 통일하기`
  - `#118 feat: 세션 상태 모델과 위험도 규칙 정의하기`
  - `#119 fix: 연결 끊김과 재연결 상태 UX 보강하기`

## 목표

Sprint 1의 목표는 아래 3가지를 먼저 고정하는 것이다.

1. 제품 이름과 용어를 하나로 통일한다.
2. 세션 상태 모델과 위험도 규칙의 기준을 문서화한다.
3. 연결 상태 UX를 신뢰 가능한 수준으로 정리한다.

## 에이전트 구성

| Agent | Model | Brief |
|---|---|---|
| Lead PM | `gpt-5.2` | [lead-pm.md](/Users/yunseojin/claude-code-monitor/docs/briefs/sprint-1/lead-pm.md) |
| Architect Reviewer | `claude-opus-4.1` | [architect-reviewer.md](/Users/yunseojin/claude-code-monitor/docs/briefs/sprint-1/architect-reviewer.md) |
| Backend Builder | `gpt-5.2-codex` | [backend-builder.md](/Users/yunseojin/claude-code-monitor/docs/briefs/sprint-1/backend-builder.md) |
| Frontend Builder | `claude-sonnet-4.6` | [frontend-builder.md](/Users/yunseojin/claude-code-monitor/docs/briefs/sprint-1/frontend-builder.md) |
| QA Ops | `gpt-5-mini` | [qa-ops.md](/Users/yunseojin/claude-code-monitor/docs/briefs/sprint-1/qa-ops.md) |

## 권장 실행 순서

1. Lead PM이 `#117`, `#118`, `#119`의 범위와 용어 기준을 고정한다.
2. Architect Reviewer가 `#118` 상태 모델 초안을 만든다.
3. Frontend Builder와 Backend Builder가 `#117`, `#119`에 필요한 변경 포인트를 정리한다.
4. QA Ops가 연결 상태와 브랜드/문구 회귀 체크리스트를 준비한다.
5. 구현 후 Architect Reviewer와 QA Ops가 게이트를 통과시킨다.

## 핸드오프 규칙

- 모든 에이전트는 작업 종료 시 `Summary / Decisions / Risks / Tests / Next` 형식으로 남긴다.
- `#118`이 고정되기 전에는 `#119`의 연결 상태 문구를 최종 확정하지 않는다.
- `#117`이 고정되기 전에는 UI 텍스트를 임의로 새 이름으로 확장하지 않는다.
- Sprint 1은 `문서 + 기준 + 신뢰성`이 목표이므로, Batch 2 범위 구현으로 넘어가지 않는다.
