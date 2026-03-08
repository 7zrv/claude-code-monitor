# Backend Builder Brief

- Agent: `Backend Builder`
- Model: `gpt-5.2-codex`
- Sprint: `Sprint 1`

## 맡은 이슈

- 보조: `#118 feat: 세션 상태 모델과 위험도 규칙 정의하기`
- 보조: `#119 fix: 연결 끊김과 재연결 상태 UX 보강하기`

## 목표

- Sprint 1에서 바로 필요한 백엔드 사실 관계를 정리한다.
- 상태 계산 위치가 백엔드라면 어떤 데이터가 필요한지 먼저 확정한다.
- 연결 상태 UX와 관련된 서버 측 신호를 점검한다.

## 입력

- `/Users/yunseojin/claude-code-monitor/src/http.rs`
- `/Users/yunseojin/claude-code-monitor/src/state.rs`
- `/Users/yunseojin/claude-code-monitor/src/types.rs`
- `/Users/yunseojin/claude-code-monitor/src/main.rs`
- `/Users/yunseojin/claude-code-monitor/public/lib/connection.js`

## 해야 할 일

1. 현재 스냅샷과 SSE에서 상태 계산에 필요한 필드가 충분한지 점검한다.
2. `#118` 상태 모델이 백엔드 계산일 경우 필요한 구조 변경을 적는다.
3. `#119`와 관련해 서버가 줄 수 있는 연결/시간 정보가 무엇인지 정리한다.
4. 추가 API 없이 해결 가능한지, 새 필드가 필요한지 판단한다.
5. 구현 전에 테스트 포인트를 정리한다.

## 산출물

- 백엔드 영향도 메모
- 필요한 필드/계산 위치 제안
- 테스트 포인트 초안

## 완료조건

- Frontend Builder가 어떤 데이터를 기대할 수 있는지 명확해진다.
- 상태 모델 반영 시 백엔드 수정 범위가 드러난다.
- 연결 상태 UX에 필요한 서버 측 정보가 정리된다.

## 핸드오프

- To: `Frontend Builder`, `QA Ops`
- 전달물:
  - 백엔드에서 제공 가능한 신호
  - 필요한 추가 필드
  - 테스트 포인트

## 작업 종료 템플릿

```md
## Summary
- 서버 측 영향 범위

## Decisions
- 계산 위치 제안
- 필요한 필드

## Risks
- 구조 변경이 필요한 지점

## Tests
- 추가 또는 필요한 테스트

## Next
- Frontend/QA가 바로 확인할 항목
```
