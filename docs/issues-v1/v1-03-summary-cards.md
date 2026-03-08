# feat: 상단 요약 카드를 세션 중심 지표로 개편하기

- Backlog ID: `V1-03`
- Labels: `status: ready`, `priority: high`, `enhancement`

## 배경

현재 카드 구성은 `Active`, `Error`, `Sessions`, `Tokens`, `Cost` 중심이다.
v1에서는 사용자가 카드만 보고도 활성 규모와 위험 규모를 함께 이해해야 하므로, 세션 중심 운영 지표로 개편할 필요가 있다.

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
- 카드 수는 늘리기보다 의사결정에 필요한 정보만 남기는 방향이 적절하다.
