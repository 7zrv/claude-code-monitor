# Claude Code Monitor v1 Batch 4 최종 등록본

- 작성일: 2026-03-08
- 목적: `Batch 4` 이슈 3개를 GitHub에 바로 등록할 수 있게 제목, 라벨, 본문을 압축 정리한다.

## V1-13

Title:
`feat: 세션 내부 계층형 agent 트리 추가하기`

Labels:
`status: ready`, `priority: low`, `enhancement`

Body:

```md
## 배경
서브에이전트가 있는 세션에서는 agent 관계를 트리로 보여주면 이해가 쉬워진다.
다만 v1의 핵심은 세션 중심 진단이므로, 이 기능은 확장 항목으로 다루는 편이 적절하다.

## 작업 내용
- [ ] 세션 내 lead agent와 child agent의 표현 규칙을 확정한다.
- [ ] agent 테이블 또는 세션 상세 안에서 트리를 표시할 위치를 정한다.
- [ ] 펼침/접힘과 모바일 표시 방식까지 함께 검토한다.
- [ ] 세션 중심 정보구조를 해치지 않도록 상호작용을 설계한다.
- [ ] 관련 테스트를 보강한다.

## 관련 파일
- `public/lib/agent-tree.js`
- `public/lib/renders/agents.js`
- `public/app.js`
- `public/styles.css`
- `PLAN.md`

## 비고
- v1 출시 이후 `v1.1`로 넘겨도 무방하다.
```

## V1-14

Title:
`feat: 사용자 정의 alert 규칙 추가하기`

Labels:
`status: ready`, `priority: low`, `enhancement`

Body:

```md
## 배경
사용자마다 중요하게 보는 운영 기준이 다르다.
하지만 v1에서는 고정 규칙만으로도 가치 검증이 가능하므로, 사용자 정의 alert는 후속 확장으로 보는 것이 적절하다.

## 작업 내용
- [ ] 사용자 정의 가능한 alert 범위를 정한다. 예: stuck 임계값, 비용 임계값
- [ ] 설정 저장 위치와 형식을 검토한다.
- [ ] 기본 규칙과 사용자 규칙이 충돌할 때의 우선순위를 정한다.
- [ ] UI 노출 방식과 복잡도 범위를 제한한다.
- [ ] 문서와 예시를 준비한다.

## 관련 파일
- `public/lib/persistence.js`
- `public/lib/renders/alerts.js`
- `public/app.js`
- `src/state.rs`
- `docs/prd-v1.md`

## 비고
- `V1-09` 고정 규칙이 안정화된 뒤 진행하는 것이 맞다.
```

## V1-15

Title:
`feat: 세션 데이터 export 추가하기`

Labels:
`status: ready`, `priority: low`, `enhancement`

Body:

```md
## 배경
세션 회고, 비용 분석, 외부 리포트 작성을 위해 데이터를 내보내고 싶어질 수 있다.
다만 v1의 핵심 루프는 실시간 진단이므로 export는 후속 확장 항목으로 보는 것이 적절하다.

## 작업 내용
- [ ] export 대상 범위를 정한다. 예: 세션 단위, 기간 단위, alerts 포함 여부
- [ ] 파일 형식을 정한다. 예: JSON, CSV
- [ ] 개인정보나 민감한 프롬프트 노출 위험을 검토한다.
- [ ] export 진입 위치와 사용자 흐름을 설계한다.
- [ ] 기본 검증 시나리오를 정리한다.

## 관련 파일
- `src/http.rs`
- `src/state.rs`
- `src/types.rs`
- `public/app.js`
- `public/lib/renders/sessions.js`
- `docs/prd-v1.md`

## 비고
- export는 기능 자체보다 범위와 안전성이 더 중요하다.
```
