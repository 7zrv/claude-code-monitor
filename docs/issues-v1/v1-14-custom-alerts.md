# feat: 사용자 정의 alert 규칙 추가하기

- Backlog ID: `V1-14`
- Labels: `status: ready`, `priority: low`, `enhancement`

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

- 초기 버전에서는 옵션 과다로 흐르지 않도록 주의해야 한다.
- `V1-09` 고정 규칙이 안정화된 뒤 진행하는 것이 맞다.
