# Claude Monitor

[![GitHub release](https://img.shields.io/github/v/release/7zrv/claude-code-monitor)](https://github.com/7zrv/claude-code-monitor/releases)
[![License](https://img.shields.io/github/license/7zrv/claude-code-monitor)](https://github.com/7zrv/claude-code-monitor/blob/main/LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.56%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)

Claude Code 에이전트의 실시간 모니터링 대시보드. Rust 백엔드 + 정적 UI(`public/*`) 구조.

## 핵심 기능
- `POST /api/events` 이벤트 수집
- `GET /api/events` 스냅샷
- `GET /api/stream` SSE 스트림
- `GET /api/alerts` 경고/오류 알림
- `~/.claude/history.jsonl`, `~/.claude/projects/` 자동 수집(내장)
- 대시보드: agent/workflow/source/alerts/최근 이벤트
- 토큰 지표: 총 토큰(`totals.tokenTotal`) + 에이전트별 토큰(`agents[].tokenTotal`)

## 실행 (Rust)
```bash
cargo run --release
```

열기: `http://localhost:5050`

환경변수:
- `PORT` (기본: `5050`)
- `HOST` (기본: `127.0.0.1`)
- `CLAUDE_HOME` (기본: `~/.claude`)
- `CLAUDE_POLL_MS` (기본: `2500`)
- `CLAUDE_BACKFILL_LINES` (기본: `25`)
- `MONITOR_API_KEY` (설정 시 `POST /api/events`에 `x-api-key` 필수)
- `PUBLIC_DIR` (기본: `public`) — 정적 파일 디렉토리 경로
- `HTTP_READ_TIMEOUT_SEC` (기본: `5`)

## 데스크톱 앱 실행
```bash
npm install
npm run desktop:start
```

Electron 창에서 Rust 서버(`cargo run --release`)를 내부적으로 기동합니다.

## 검증
```bash
npm run check
```

연결 상태는 헤더 배지에서 `connected / reconnecting / offline`으로 확인할 수 있습니다.

## 역할 분배 기반 마이그레이션
- 총괄: [role-plan.md](migration/role-plan.md)
- 진행 현황: [progress.md](migration/progress.md)
