# feat: stuck 세션과 cost spike 규칙 탐지하기

- Backlog ID: `V1-09`
- Labels: `status: ready`, `priority: medium`, `enhancement`

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
- 초기에는 단순 규칙으로 시작하고, 나중에 사용자 정의 규칙으로 확장할 수 있다.
