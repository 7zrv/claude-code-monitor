# Frontend Regression Result (2026-02-25)

## 자동 체크 결과
- `npm run check`: PASS
- `LOAD_DURATION_SEC=20 LOAD_EVENTS_PER_SEC=10 npm run test:frontend:load`: PASS
- `LOAD_DURATION_SEC=10 LOAD_EVENTS_PER_SEC=12 npm run test:frontend:load`: PASS

## 부하 테스트 요약
### Case A (20s x 10eps)
- sent: 200 events
- totals.total: 202
- source 반영: `load_test` 200건 확인
- recentCount: 50
- alertsCount: 20

### Case B (10s x 12eps)
- sent: 120 events
- totals.total: 120
- source 반영: `load_test` 120건 확인
- recentCount: 50
- alertsCount: 20

## 판정
- 프론트 데이터 수신/렌더 경로 정상
- 대량 이벤트 입력 시 데이터 갱신 정상
- 필터 상태 영속화(localStorage) 및 결과 카운트 표시 추가

## 남은 항목 (수동)
- 연결 상태 배지 시각 확인 (`connected/reconnecting/offline`)
- 필터/검색/행수 변경 UI 체감 점검
- 장시간 스크롤/인터랙션 프리즈 여부 확인
