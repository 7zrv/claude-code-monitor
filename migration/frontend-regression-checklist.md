# Frontend Regression Checklist

## 자동 체크
1. 정적/문법 체크: `npm run check`
2. 부하 체크: `LOAD_DURATION_SEC=20 LOAD_EVENTS_PER_SEC=10 npm run test:frontend:load`
3. 기대값:
- 요청 실패 없음
- `/api/events` totals 증가 확인
- source에 `load_test` 반영

## 수동 UI 체크
1. 연결 상태 배지
- 초기 `reconnecting` -> `connected`
- 서버 중단 시 `offline`
- 서버 재기동 후 `connected` 복구

2. 이벤트 필터
- status `warning` 선택 시 warning만 노출
- status `error` 선택 시 error만 노출
- `all`에서 전체 복귀

3. 검색
- 검색어 입력 시 `event/message/agentId` 기준 필터
- 검색어 제거 시 원복

4. 행수 제어
- `Rows` 50/100/200 선택 시 표시 개수 즉시 반영

5. 대량 이벤트 렌더
- 부하 테스트 중 화면 프리즈 없이 스크롤 가능
- 카드/테이블/알림 패널 값이 업데이트됨

## 결론 기록 템플릿
- 날짜:
- 자동 체크 결과:
- 수동 체크 결과:
- 이슈:
- 조치:
