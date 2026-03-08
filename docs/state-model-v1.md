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

- 조건: `error === 0` 이고 `warning > 0`
- 의미: 세션이 실패하진 않았지만 경고 상태로 진입했다.
- 예: 재시도, 도구 호출 문제, 사용자 개입 필요 가능성

### `active`

- 조건: `error === 0`, `warning === 0`, `total > 0`, `lastSeen < 30초`
- 의미: 최근 작업이 들어온 정상 진행 세션

### `completed`

- 조건: `error === 0`, `warning === 0`, `total > 0`, `lastSeen >= 120초`
- 의미: 최근 이벤트가 없고 완료된 것으로 간주하는 세션

### `idle`

- 조건:
  - 이벤트가 아직 없거나
  - `lastSeen`이 없거나
  - 최근 이벤트가 30초 이상 120초 미만으로 비어 있는 중간 구간
- 의미: 진행 중이라고 단정할 수 없고, 완료로도 확정하지 않는 상태

## 판정 우선순위

1. `failed`
2. `stuck`
3. `active`
4. `completed`
5. `idle`

경고가 있는 세션은 최근 이벤트가 있더라도 `active`보다 `stuck`을 우선한다.

## workflow 매핑

- `active` -> `running`
- `stuck` -> `at-risk`
- `failed` -> `blocked`
- `completed` -> `completed`
- `idle` -> `idle`

매핑 구현: [public/lib/workflow.js](/Users/yunseojin/claude-code-monitor/public/lib/workflow.js)

## 현재 적용 위치

- workflow 영역 상태 재계산
- session list 상태 배지 표시
- 테스트 계약

## v1 한계

- `stuck`은 현재 `warning > 0` 기반의 단순 규칙이다.
- `idle`의 30초~120초 구간은 향후 `paused` 또는 `cooldown`으로 분리할 수 있다.
- 세션 단위 `cost spike`와 `silence` 탐지는 `#125`에서 확장한다.
