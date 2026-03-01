# Release Checklist

## Lead Gate
- [x] `npm run check` 통과
- [x] `cargo build --release` 통과
- [ ] Rust 모드 실행 확인 (`cargo run --release`)
- [ ] 데스크톱 모드 실행 확인 (`npm run desktop:start`)

## Functional Gate
- [ ] `/api/health` 정상
- [x] `/api/events` 스냅샷 정상
- [ ] `/api/stream` SSE 연결/재연결 정상
- [x] `.claude` 수집 이벤트가 대시보드에 반영됨

## Quality Gate
- [x] 2색 제한 준수 (`#E26D5C`, `#F6EDE3`)
- [ ] 연결 상태 배지(`connected/reconnecting/offline`) 동작
- [ ] 알림 패널 warning/error 반영

## Security Gate
- [x] `MONITOR_API_KEY` 설정 시 `POST /api/events` 인증 필요 확인
- [x] 잘못된 API Key에서 `401 Unauthorized` 확인

## Rollback
- [ ] 문제 발생 시 Node 레거시 서버로 임시 전환 절차 확인
