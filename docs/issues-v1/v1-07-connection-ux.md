# fix: 연결 끊김과 재연결 상태 UX 보강하기

- Backlog ID: `V1-07`
- Labels: `status: ready`, `priority: high`, `bug`

## 배경

모니터링 도구는 데이터가 없는 이유를 사용자가 추측하게 만들면 안 된다.
현재 연결 배지는 있지만, 수집 실패와 UI 연결 실패, 단순 무이벤트 상황의 차이를 충분히 설명하지 못한다.

## 작업 내용
- [ ] `connected`, `reconnecting`, `offline` 상태 정의를 명확히 한다.
- [ ] 마지막 성공 시각 또는 마지막 수신 시각을 노출한다.
- [ ] 연결 실패 시 보여줄 안내 문구를 정리한다.
- [ ] 수집 실패와 UI 스트림 실패를 구분해 표현할 수 있는지 검토한다.
- [ ] 연결 상태 변화에 대한 회귀 테스트 또는 수동 검증 절차를 정리한다.

## 관련 파일
- `public/lib/connection.js`
- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `src/http.rs`

## 비고

- 운영 신뢰성과 직결되는 항목이다.
- `V1-08` 빈 상태 작업과 함께 묶으면 사용자 경험이 더 자연스럽다.
