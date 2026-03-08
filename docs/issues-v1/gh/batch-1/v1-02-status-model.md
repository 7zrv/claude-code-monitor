## 배경
현재는 `ok`, `warning`, `error`와 최근 활동 시각을 섞어 상태를 해석하고 있다.
`Needs Attention`, 세션 정렬, 카드 지표를 일관되게 만들려면 세션 단위 상태 모델이 먼저 필요하다.

## 작업 내용
- [ ] 세션 상태 집합을 정의한다. 예: `active`, `idle`, `stuck`, `completed`, `failed`
- [ ] 상태별 판정 규칙과 우선순위를 문서화한다.
- [ ] 상태 계산 위치를 정한다. 프론트엔드, 백엔드, 또는 공통 계산 규칙
- [ ] workflow, sessions, alerts, cards가 같은 상태 모델을 쓰도록 기준을 맞춘다.
- [ ] 경계 사례를 정리한다.

## 관련 파일
- `docs/prd-v1.md`
- `docs/ia-v1.md`
- `public/lib/workflow.js`
- `public/app.js`
- `src/state.rs`
- `src/types.rs`

## 비고
- `V1-03`, `V1-04`, `V1-05`, `V1-11`의 선행 조건이다.
