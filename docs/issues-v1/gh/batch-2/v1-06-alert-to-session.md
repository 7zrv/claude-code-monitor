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
