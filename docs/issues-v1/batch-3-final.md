# Claude Code Monitor v1 Batch 3 최종 등록본

- 작성일: 2026-03-08
- 목적: `Batch 3` 이슈 5개를 GitHub에 바로 등록할 수 있게 제목, 라벨, 본문을 압축 정리한다.

## V1-08

Title:
`feat: 첫 실행 빈 상태와 수집 경로 안내 추가하기`

Labels:
`status: ready`, `priority: medium`, `enhancement`

Body:

```md
## 배경
첫 실행 시 데이터가 없으면 현재 화면은 비어 보이거나 고장처럼 보일 수 있다.
신규 사용자가 다음 행동을 이해하도록 빈 상태와 수집 경로 안내가 필요하다.

## 작업 내용
- [ ] 데이터가 없는 첫 실행 상태를 별도로 정의한다.
- [ ] 수집 대상 경로와 수집 주기를 안내하는 문구를 만든다.
- [ ] 빈 상태와 연결 실패 상태가 혼동되지 않도록 구분한다.
- [ ] 세션이 아직 없을 때 보여줄 대표 섹션의 안내 UI를 정리한다.
- [ ] 필요 시 예시 화면 또는 데모 데이터 노출 방향을 검토한다.

## 관련 파일
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `README.md`
- `docs/ia-v1.md`

## 비고
- 신규 사용자 이탈을 줄이는 데 직접적인 영향이 있다.
```

## V1-09

Title:
`feat: stuck 세션과 cost spike 규칙 탐지하기`

Labels:
`status: ready`, `priority: medium`, `enhancement`

Body:

```md
## 배경
`warning`, `error`만으로는 실제 개입이 필요한 운영 리스크를 충분히 포착하지 못한다.
무응답 세션과 급격한 비용 증가를 추가로 탐지해야 대시보드가 운영 도구로 완성된다.

## 작업 내용
- [ ] `stuck`의 초기 임계값과 예외 규칙을 정한다.
- [ ] `cost spike` 또는 `token spike`의 계산 기준을 정한다.
- [ ] 탐지 결과를 `Needs Attention`과 카드에 반영하는 방법을 설계한다.
- [ ] false positive를 줄이기 위한 보호 규칙을 정한다.
- [ ] 탐지 규칙을 문서와 테스트 케이스로 남긴다.

## 관련 파일
- `src/state.rs`
- `src/types.rs`
- `public/app.js`
- `public/lib/cards.js`
- `public/lib/workflow.js`
- `docs/prd-v1.md`

## 비고
- 상태 모델 정의 이후에 구현해야 한다.
```

## V1-10

Title:
`refactor: workflow와 그래프를 보조 분석 영역으로 정리하기`

Labels:
`status: ready`, `priority: medium`, `enhancement`

Body:

```md
## 배경
현재 화면은 차트와 타임라인이 세션 진단 영역보다 앞에 있어 제품 초점을 흐린다.
v1에서는 분석 패널이 아니라 진단 패널이 먼저 보여야 한다.

## 작업 내용
- [ ] workflow, timeline, graphs, recent events의 새 배치 순서를 확정한다.
- [ ] 세션 작업 공간과 alerts가 상단 진단 흐름을 차지하도록 구조를 조정한다.
- [ ] 모바일에서 분석 영역의 우선순위를 더 낮추는 레이아웃을 검토한다.
- [ ] 섹션 제목과 설명이 역할에 맞게 읽히도록 문구를 정리한다.
- [ ] 새 배치가 사용성에 미치는 영향을 수동 점검한다.

## 관련 파일
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/lib/renders/timeline.js`
- `public/lib/renders/charts.js`
- `docs/ia-v1.md`

## 비고
- 기능 추가보다 정보 우선순위 정리가 핵심이다.
```

## V1-11

Title:
`feat: 세션 정렬과 필터를 위험도 중심으로 개선하기`

Labels:
`status: ready`, `priority: medium`, `enhancement`

Body:

```md
## 배경
세션 수가 늘어나면 단순 최근순 정렬만으로는 문제 세션을 빠르게 찾기 어렵다.
위험도, 최근 활동, 비용을 반영한 정렬과 필터가 필요하다.

## 작업 내용
- [ ] 세션 목록 기본 정렬 규칙을 정의한다.
- [ ] 위험도, 최근 활동, 비용 중심 정렬 기준을 구현한다.
- [ ] 세션 검색 또는 빠른 필터 도입 범위를 결정한다.
- [ ] 기존 event 필터와 세션 필터의 역할을 구분한다.
- [ ] 정렬/필터 상태 보존 여부를 검토한다.

## 관련 파일
- `public/app.js`
- `public/lib/renders/sessions.js`
- `public/lib/persistence.js`
- `src/state.rs`
- `docs/ia-v1.md`

## 비고
- 세션이 많은 실제 사용 상황에서 체감 가치가 큰 작업이다.
```

## V1-12

Title:
`fix: 대량 이벤트 상황의 응답성 확보하기`

Labels:
`status: ready`, `priority: high`, `bug`

Body:

```md
## 배경
운영 도구는 이벤트가 많아지는 순간에도 핵심 기능이 흔들리면 안 된다.
첫 화면 렌더링, 세션 상세 진입, 필터링, 스트림 반영이 느려지면 v1 신뢰가 크게 떨어진다.

## 작업 내용
- [ ] 대량 이벤트 상황에서 병목이 되는 렌더링 지점을 확인한다.
- [ ] 핵심 상호작용의 허용 가능한 반응 속도 기준을 정한다.
- [ ] 필요 시 리스트 길이, 차트 계산, 세션 상세 렌더링 방식을 최적화한다.
- [ ] 기본 검증 시나리오와 재현 절차를 문서화한다.
- [ ] 회귀를 막기 위한 테스트 또는 수동 부하 검증 루틴을 추가한다.

## 관련 파일
- `public/app.js`
- `public/lib/state.js`
- `public/lib/renders/events.js`
- `public/lib/renders/sessions.js`
- `public/lib/renders/charts.js`
- `public/__tests__/`

## 비고
- 출시 차단 항목이다.
```
