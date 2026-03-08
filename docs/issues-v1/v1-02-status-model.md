# feat: 세션 상태 모델과 위험도 규칙 정의하기

- Backlog ID: `V1-02`
- Labels: `status: ready`, `priority: high`, `enhancement`

## 배경

현재 UI는 `ok`, `warning`, `error`와 최근 활동 시각을 조합해 상태를 보여주지만, 운영 대응에 필요한 `active`, `stuck`, `failed`, `completed` 같은 판단 규칙은 분리되어 있지 않다.
`Needs Attention`, 세션 정렬, 카드 지표를 일관되게 만들려면 공통 상태 모델이 먼저 필요하다.

## 작업 내용
- [ ] 세션 단위 상태 집합을 정의한다. 예: `active`, `idle`, `stuck`, `completed`, `failed`
- [ ] 상태별 판정 규칙과 우선순위를 문서화한다.
- [ ] 프론트엔드와 백엔드 중 어디에서 상태를 계산할지 결정한다.
- [ ] 현재 workflow, sessions, alerts, cards가 같은 상태 모델을 쓰도록 기준을 맞춘다.
- [ ] 경계 사례를 정리한다. 예: warning이 있지만 최근 활동이 있는 세션, 장시간 무응답 세션

## 관련 파일
- `docs/prd-v1.md`
- `docs/ia-v1.md`
- `public/lib/workflow.js`
- `public/app.js`
- `src/state.rs`
- `src/types.rs`

## 비고

- `V1-03`, `V1-04`, `V1-05`, `V1-11`의 선행 조건이다.
- 문서 정의만으로 끝나지 않고 실제 표시 로직까지 연결되어야 한다.
