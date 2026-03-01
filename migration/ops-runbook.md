# Ops Runbook

## Start
1. 프로젝트 루트로 이동
2. `cargo run --release`
3. 헬스체크: `curl -s http://localhost:5050/api/health`

## Desktop Start
1. 프로젝트 루트로 이동
2. `npm run desktop:start`

## Incident: No Event Updates
1. `/api/health` 확인
2. `CLAUDE_HOME` 경로 확인
3. `.claude/history.jsonl`, `.claude/projects/` 갱신 여부 확인
4. 앱 재기동

## Incident: Unauthorized POST
1. `MONITOR_API_KEY` 설정 여부 확인
2. 호출 측에서 `x-api-key` 헤더 전달 확인

## Safe Defaults
- 기본 바인딩: `127.0.0.1:5050`
- 실사용 권장: 로컬 환경에서만 노출
