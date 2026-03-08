# Claude Code Monitor v1 이슈 초안

- 작성일: 2026-03-08
- 기준 문서: `docs/backlog-v1.md`
- 목적: v1 백로그를 GitHub 이슈 템플릿 형식으로 바로 등록할 수 있게 정리한다.

## 사용법

1. 아래 파일 중 하나를 열어 제목과 본문을 그대로 복사한다.
2. GitHub에서 새 이슈를 만든다.
3. 문서 상단의 `Labels` 값을 이슈 라벨로 적용한다.
4. 필요하면 담당 범위에 맞게 체크리스트만 조정한다.

추천 등록 순서는 [issue-order.md](./issue-order.md)를 따른다.
실행 전 최종 점검은 [preflight.md](./preflight.md)와 [gh/preflight.sh](./gh/preflight.sh)를 사용한다.
`Batch 1` 바로 등록용 압축본은 [batch-1-final.md](./batch-1-final.md)를 사용한다.
`gh issue create` 스크립트는 [gh/batch-1/create.sh](./gh/batch-1/create.sh)를 사용한다.
`Batch 2` 바로 등록용 압축본은 [batch-2-final.md](./batch-2-final.md)를 사용한다.
`Batch 2`용 `gh issue create` 스크립트는 [gh/batch-2/create.sh](./gh/batch-2/create.sh)를 사용한다.
`Batch 3` 바로 등록용 압축본은 [batch-3-final.md](./batch-3-final.md)를 사용한다.
`Batch 3`용 `gh issue create` 스크립트는 [gh/batch-3/create.sh](./gh/batch-3/create.sh)를 사용한다.
`Batch 4` 바로 등록용 압축본은 [batch-4-final.md](./batch-4-final.md)를 사용한다.
`Batch 4`용 `gh issue create` 스크립트는 [gh/batch-4/create.sh](./gh/batch-4/create.sh)를 사용한다.

## 등록 묶음

### Batch 1. 제품 기준선과 신뢰성

- `v1-01-branding.md`
- `v1-02-status-model.md`
- `v1-07-connection-ux.md`

목적:
제품 이름, 상태 판단 기준, 연결 신뢰도를 먼저 고정한다.

### Batch 2. 핵심 진단 경험

- `v1-03-summary-cards.md`
- `v1-04-needs-attention.md`
- `v1-05-sessions-workspace.md`
- `v1-06-alert-to-session.md`

목적:
첫 화면에서 문제 세션을 보고, 세션 상세로 바로 들어가는 흐름을 만든다.

### Batch 3. 완성도 보강

- `v1-08-empty-state.md`
- `v1-09-risk-detection.md`
- `v1-10-analysis-layout.md`
- `v1-11-session-sorting.md`
- `v1-12-performance.md`

목적:
온보딩, 운영 탐지, 정보구조, 성능을 마감한다.

### Batch 4. 후속 확장

- `v1-13-agent-tree.md`
- `v1-14-custom-alerts.md`
- `v1-15-export.md`

목적:
v1 이후 확장 기능을 별도 트랙으로 관리한다.

## 전체 파일 목록

- `v1-01-branding.md`
- `v1-02-status-model.md`
- `v1-03-summary-cards.md`
- `v1-04-needs-attention.md`
- `v1-05-sessions-workspace.md`
- `v1-06-alert-to-session.md`
- `v1-07-connection-ux.md`
- `v1-08-empty-state.md`
- `v1-09-risk-detection.md`
- `v1-10-analysis-layout.md`
- `v1-11-session-sorting.md`
- `v1-12-performance.md`
- `v1-13-agent-tree.md`
- `v1-14-custom-alerts.md`
- `v1-15-export.md`
