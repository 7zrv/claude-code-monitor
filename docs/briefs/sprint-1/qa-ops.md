# QA Ops Brief

- Agent: `QA Ops`
- Model: `gpt-5-mini`
- Sprint: `Sprint 1`

## 맡은 이슈

- `#119 fix: 연결 끊김과 재연결 상태 UX 보강하기`
- 보조: `#117`, `#118`

## 목표

- Sprint 1의 결과가 사용자 신뢰를 높이는지 검증한다.
- 연결 상태, 브랜드 문구, 상태 모델 정의의 회귀 포인트를 체크리스트로 만든다.

## 입력

- `/Users/yunseojin/claude-code-monitor/public/lib/connection.js`
- `/Users/yunseojin/claude-code-monitor/public/index.html`
- `/Users/yunseojin/claude-code-monitor/public/app.js`
- `/Users/yunseojin/claude-code-monitor/README.md`
- `/Users/yunseojin/claude-code-monitor/docs/issues-v1/preflight.md`

## 해야 할 일

1. 연결 상태별 수동 검증 시나리오를 만든다.
2. 제품명과 UI 문구가 섞여 남아 있는 위치를 찾는다.
3. `#118` 상태 모델 문서가 실제 UI와 충돌하지 않는지 체크 항목을 만든다.
4. 회귀 위험을 짧은 목록으로 정리한다.
5. Sprint 1 종료 기준 체크리스트를 만든다.

## 산출물

- 수동 검증 체크리스트
- 회귀 위험 목록
- Sprint 1 종료 게이트 문안

## 완료조건

- `#117`, `#118`, `#119`를 검증하는 체크리스트가 있다.
- 연결 상태 UX를 재현 가능한 시나리오로 확인할 수 있다.
- Sprint 2로 넘어가기 전에 막아야 할 위험이 명확하다.

## 핸드오프

- To: `Lead PM`
- 전달물:
  - 검증 결과
  - 남은 위험
  - Sprint 1 통과/보류 의견

## 작업 종료 템플릿

```md
## Summary
- 검증한 범위

## Decisions
- 통과 또는 보류 판단

## Risks
- 남은 회귀 위험

## Tests
- 수동 검증 시나리오와 결과

## Next
- 다음 Sprint 전 해결할 항목
```
