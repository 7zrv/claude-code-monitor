# Multi-Agent Runbook

## 1) Kickoff (Lead: 경량화)
- 목표, 범위, 제외 항목을 10줄 이내로 확정한다.
- 작업을 `디자인`, `프론트`, `기능개발` 스트림으로 분리한다.
- Lead는 승인자가 아니라 `우선순위/리스크 관리자`로 동작한다.

## 2) Autonomous Build Loop (Designer/Frontend/Backend)
- Designer: UI 상태/토큰/가독성 규칙 확정.
- Frontend: UI 구현/회귀 테스트/성능 개선.
- Backend: API/보안/안정성 구현.
- 세 역할은 일상 변경에서 Lead 승인 없이 직접 합의 후 진행한다.

## 3) Escalation Only When Needed
아래 조건일 때만 Lead 에스컬레이션:
- 범위 확대(신규 에픽 추가)
- 역할 간 합의 실패(24시간 내 미해결)
- 릴리스 차단 수준 리스크
- 외부 의존성/비용 영향이 큰 결정

## 4) Integration Gate (Lead)
- 릴리스 체크리스트 최종 확인.
- unresolved 이슈 triage.
- 승인/보류 판단.

## Review Routing
- Frontend PR 리뷰: Designer + Backend
- Backend PR 리뷰: Frontend
- Designer 명세 리뷰: Frontend
- Lead는 샘플링 리뷰(핵심 변경만)

## WIP Limits
- Lead 동시 in-progress: 최대 2개
- Frontend/Backend/Designer 동시 in-progress: 최대 3개

## Handoff Format
- 입력: 무엇을 받았는지 3줄
- 산출: 무엇을 만들었는지 3줄
- 결정: 어떤 트레이드오프를 택했는지 3줄
- 요청: 다음 역할에게 필요한 액션 3줄
