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
