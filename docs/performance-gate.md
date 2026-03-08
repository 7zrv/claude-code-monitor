# Performance Gate

대량 이벤트 상황에서 대시보드 응답성이 무너지는지 빠르게 확인하기 위한 회귀 방지 루틴이다.

## 시나리오

### A. Stream Accumulation

- 세션 80개
- 세션당 에이전트 3개
- 합성 이벤트 2,500개
- 확인 항목:
  - 상단 카드 계산
  - 세션 리스트 렌더링
  - 이벤트 리스트 렌더링
  - 차트 렌더링

### B. Session Drilldown Under Load

- 누적 이벤트가 있는 상태에서 세션 상세 이벤트 160개 렌더링
- 확인 항목:
  - 상세 진입 비용
  - 필터 변경 후 이벤트 리스트 재렌더 비용

## 실행

```bash
npm run perf:gate
```

기본 기준:

- `dashboard-pass` p95 <= `150ms`
- `filter-refresh` p95 <= `100ms`
- `session-detail` p95 <= `75ms`

필요하면 환경변수로 조정할 수 있다.

```bash
PERF_GATE_EVENTS=4000 PERF_GATE_DASHBOARD_P95_MS=200 npm run perf:gate
```

## 현재 관찰 포인트

- 차트, 이벤트 리스트, 세션 상세는 모두 문자열 렌더링 비중이 높다.
- 현재 게이트는 실제 브라우저 페인팅이 아니라 렌더 함수와 데이터 가공 비용을 본다.
- 브라우저 레이아웃/페인트 병목은 별도 수동 스모크 테스트로 보완해야 한다.

## 기준선

2026-03-08 로컬 실행 기준:

- `dashboard-pass`: avg `1.61ms`, p95 `2.05ms`, max `7.01ms`
- `filter-refresh`: avg `0.15ms`, p95 `0.23ms`, max `0.23ms`
- `session-detail`: avg `0.16ms`, p95 `0.20ms`, max `0.25ms`
