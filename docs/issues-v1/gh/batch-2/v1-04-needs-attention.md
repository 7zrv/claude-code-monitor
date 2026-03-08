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
