# 세션 상태 모델 v1

이 문서는 `#118 feat: 세션 상태 모델과 위험도 규칙 정의하기`의 구현 기준이다.

## 목적

- 여러 Claude Code 세션 중 개입이 필요한 세션을 일관되게 판정한다.
- workflow, session list, alert 확장에서 같은 상태 규칙을 공유한다.

## 상태 정의

상태 계산 구현: [public/lib/session-status.js](/Users/yunseojin/claude-code-monitor/public/lib/session-status.js)

### `failed`

- 조건: `error > 0`
- 의미: 세션 내 어떤 agent라도 에러 이벤트를 기록했다.
- 우선순위: 최상위

### `stuck`

- 조건:
  - `error === 0`
  - `total > 0`
  - 최근 이벤트가 `120초` 이상 비어 있음
  - terminal hint가 없고 아직 `completed`로 보기엔 이르다
- 의미: 세션이 진행 이력은 있지만 일정 시간 동안 무응답 상태다.
- 예: 장시간 도구 대기, 끊긴 작업 흐름, 사용자 개입 필요 상태

### `active`

- 조건: `error === 0`, `total > 0`, `lastSeen < 30초`
- 의미: 최근 작업이 들어온 정상 진행 세션

### `completed`

- 조건:
  - `error === 0`
  - `total > 0`
  - 아래 둘 중 하나를 만족
    - terminal hint가 있고 `lastSeen >= 120초`
    - terminal hint가 없어도 `lastSeen >= 15분`
- 의미: 종료성 이벤트가 보였거나, 매우 긴 무응답 구간을 지나 보수적으로 완료로 간주하는 세션

### `idle`

- 조건:
  - 이벤트가 아직 없거나
  - `lastSeen`이 없거나
  - 최근 이벤트가 30초 이상 120초 미만으로 비어 있는 중간 구간
- 의미: 진행 중이라고 단정할 수 없고, 완료로도 확정하지 않는 상태

## 판정 흐름

1. `failed`: `error > 0`
2. `idle`: `total <= 0` 또는 `lastSeen`이 비어 있거나 파싱 불가
3. `active`: 최근 이벤트가 `30초` 미만
4. `completed`: terminal hint와 `120초` 이상 무응답이 함께 있거나, terminal hint 없이도 `15분` 이상 무응답
5. `stuck`: `120초` 이상 무응답이지만 `completed` 조건은 아직 아님
6. `idle`: 그 외 중간 구간

`warning`은 상태가 아니라 attention reason이다.
즉, 최근 활동이 있으면 `warning` 세션도 `active`일 수 있다.

## workflow 매핑

- `active` -> `running`
- `stuck` -> `at-risk`
- `failed` -> `blocked`
- `completed` -> `completed`
- `idle` -> `idle`

매핑 구현: [public/lib/workflow.js](/Users/yunseojin/claude-code-monitor/public/lib/workflow.js), [src/state.rs](/Users/yunseojin/claude-code-monitor/src/state.rs)

## 현재 적용 위치

- workflow 영역 상태 재계산
- session list 상태 배지 표시
- 테스트 계약

## v1 한계

- terminal hint는 현재 `lastEvent`와 agent `lastEvent` 문자열 기반의 보수 규칙이다.
- explicit 종료 이벤트가 없는 세션은 `15분` fallback 이후에야 `completed`가 된다.
- `idle`의 30초~120초 구간은 향후 `paused` 또는 `cooldown`으로 분리할 수 있다.
