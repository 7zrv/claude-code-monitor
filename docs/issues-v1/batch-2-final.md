# Claude Code Monitor v1 Batch 2 최종 등록본

- 작성일: 2026-03-08
- 목적: `Batch 2` 이슈 4개를 GitHub에 바로 등록할 수 있게 제목, 라벨, 본문을 압축 정리한다.

## V1-03

Title:
`feat: 상단 요약 카드를 세션 중심 지표로 개편하기`

Labels:
`status: ready`, `priority: high`, `enhancement`

Body:

```md
## 배경
현재 카드 구성은 `Active`, `Error`, `Sessions`, `Tokens`, `Cost` 중심이다.
v1에서는 카드만 보고도 활성 규모와 위험 규모를 함께 이해할 수 있어야 하므로, 세션 중심 운영 지표로 개편할 필요가 있다.

## 작업 내용
- [ ] 상단 카드의 대표 단위를 `agent`보다 `session` 중심으로 재정의한다.
- [ ] `Needs Attention` 또는 동등한 운영 위험 카드 추가 여부를 확정한다.
- [ ] 시간 범위 카드와 전체 누적 카드의 역할을 분리한다.
- [ ] 카드 라벨과 표시 규칙을 제품명/용어 기준에 맞춰 정리한다.
- [ ] 데이터가 0일 때와 연결이 불안정할 때의 카드 표시 원칙을 정한다.

## 관련 파일
- `public/lib/cards.js`
- `public/app.js`
- `public/index.html`
- `docs/prd-v1.md`
- `docs/ia-v1.md`

## 비고
- `V1-02` 상태 모델이 정리된 뒤 진행하는 것이 맞다.
```

## V1-04

Title:
`feat: Needs Attention 섹션으로 문제 세션 노출하기`

Labels:
`status: ready`, `priority: high`, `enhancement`

Body:

```md
## 배경
현재 첫 화면에는 경고와 오류를 즉시 모아 보여주는 세션 중심 영역이 없다.
사용자는 차트, 워크플로우, 세션 목록을 직접 훑어야 하므로 개입 우선순위를 빠르게 판단하기 어렵다.

## 작업 내용
- [ ] `Needs Attention` 섹션의 위치와 레이아웃을 정의한다.
- [ ] 표시 대상 세션의 포함 규칙을 정한다. 예: `failed`, `stuck`, `warning`, `cost spike`
- [ ] 정렬 규칙을 구현한다.
- [ ] 각 행에 보여줄 필드를 확정한다. 예: 상태, 마지막 이벤트, 마지막 활동, 토큰, 비용, agent 수
- [ ] 항목 클릭 시 세션 상세로 연결한다.
- [ ] 항목이 없을 때의 빈 상태 문구를 설계한다.

## 관련 파일
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/lib/workflow.js`
- `src/state.rs`
- `docs/ia-v1.md`

## 비고
- v1 홈 화면의 핵심 차별화 포인트다.
```

## V1-05

Title:
`refactor: Sessions Workspace를 메인 진단 영역으로 재구성하기`

Labels:
`status: ready`, `priority: high`, `enhancement`

Body:

```md
## 배경
현재 세션 리스트와 세션 상세 기능은 존재하지만, 페이지에서 차트와 워크플로우보다 뒤에 있어 메인 작업면으로 인지되기 어렵다.
v1에서는 세션 선택과 상세 진단이 핵심 흐름이므로 레이아웃과 정보 구성이 달라져야 한다.

## 작업 내용
- [ ] 세션 리스트와 상세 패널을 상단 진단 구역으로 재배치한다.
- [ ] 선택된 세션을 유지하는 상호작용 원칙을 정리한다.
- [ ] 세션 헤더에 상태, 마지막 활동, 토큰, 비용, agent 수를 노출한다.
- [ ] 세션 목록 기본 정렬을 위험도와 최근성 중심으로 정리한다.
- [ ] 모바일에서도 세션 리스트와 상세 흐름이 끊기지 않도록 구조를 조정한다.

## 관련 파일
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/lib/renders/sessions.js`
- `src/http.rs`
- `src/types.rs`

## 비고
- `V1-04`와 같은 작업 묶음으로 계획해도 된다.
```

## V1-06

Title:
`feat: alert에서 session detail로 바로 열기`

Labels:
`status: ready`, `priority: high`, `enhancement`

Body:

```md
## 배경
현재 alert drilldown은 agent 기준 맥락이 강하고, 문제 세션으로 바로 이어지는 흐름이 약하다.
v1 목표인 `경고 확인 후 2클릭 이내 진단`을 달성하려면 alert에서 session detail로 곧바로 진입할 수 있어야 한다.

## 작업 내용
- [ ] alert와 session의 연결 기준을 확정한다.
- [ ] alert 클릭 시 session detail을 여는 기본 동작을 구현한다.
- [ ] 필요한 경우 agent drilldown은 보조 정보로 남긴다.
- [ ] 동일 세션의 반복 경고를 묶는 표현 방식을 검토한다.
- [ ] 세션 상세 안에서 관련 alert 맥락이 보이도록 연결 정보를 정리한다.

## 관련 파일
- `public/lib/renders/alerts.js`
- `public/lib/renders/sessions.js`
- `public/app.js`
- `src/http.rs`
- `src/state.rs`

## 비고
- `V1-05` 이후 바로 붙이는 것이 효율적이다.
```
