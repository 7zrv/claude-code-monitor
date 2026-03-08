# Architect Reviewer Brief

- Agent: `Architect Reviewer`
- Model: `claude-opus-4.1`
- Sprint: `Sprint 1`

## 맡은 이슈

- `#118 feat: 세션 상태 모델과 위험도 규칙 정의하기`

## 목표

- 이후 Sprint 2와 Sprint 3의 기준이 되는 상태 모델을 문서화한다.
- `workflow`, `sessions`, `alerts`, `cards`가 같은 상태 모델을 쓰게 만든다.

## 입력

- `/Users/yunseojin/claude-code-monitor/docs/prd-v1.md`
- `/Users/yunseojin/claude-code-monitor/docs/ia-v1.md`
- `/Users/yunseojin/claude-code-monitor/public/lib/workflow.js`
- `/Users/yunseojin/claude-code-monitor/public/app.js`
- `/Users/yunseojin/claude-code-monitor/src/state.rs`
- `/Users/yunseojin/claude-code-monitor/src/types.rs`

## 해야 할 일

1. 세션 상태 집합을 정의한다.
   - 최소 후보: `active`, `idle`, `stuck`, `completed`, `failed`
2. 상태 판정 규칙과 우선순위를 작성한다.
3. UI와 백엔드 중 어디에서 계산할지 결정한다.
4. 경계 사례를 적는다.
   - warning이 있으나 최근 활동이 있는 경우
   - 무응답이지만 완료 세션으로 보는 경우
5. 리뷰 관점에서 위험 목록을 남긴다.

## 산출물

- 상태 모델 정의 문서 초안
- 위험도 정렬 규칙
- 경계 사례 목록

## 완료조건

- 같은 세션에 대해 누구나 같은 상태를 설명할 수 있다.
- `#120`, `#121`, `#122`, `#125`, `#127`이 이 문서를 기준으로 구현 가능하다.
- 최소 3개 이상의 경계 사례가 문서에 반영된다.

## 핸드오프

- To: `Backend Builder`, `Frontend Builder`, `QA Ops`
- 전달물:
  - 상태 집합
  - 판정 규칙
  - 표시 우선순위
  - 남은 위험

## 작업 종료 템플릿

```md
## Summary
- 정의한 상태 모델

## Decisions
- 상태 집합
- 계산 위치
- 우선순위

## Risks
- 애매한 케이스

## Tests
- 문서 리뷰 또는 코드 대조 결과

## Next
- Backend/Frontend에서 반영할 포인트
```
