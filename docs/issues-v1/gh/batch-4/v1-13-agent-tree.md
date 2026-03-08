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
