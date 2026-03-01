# Claude Code Monitor

[![GitHub release](https://img.shields.io/github/v/release/7zrv/claude-code-monitor)](https://github.com/7zrv/claude-code-monitor/releases)
[![License](https://img.shields.io/github/license/7zrv/claude-code-monitor)](https://github.com/7zrv/claude-code-monitor/blob/main/LICENSE)
[![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)

Claude 에이전트의 실시간 모니터링 대시보드. Rust 백엔드 + Node.js 서버 + Electron 데스크톱 앱 구조.

## 핵심 기능

- `POST /api/events` 이벤트 수집
- `GET /api/events` 스냅샷
- `GET /api/stream` SSE 실시간 스트림
- `GET /api/alerts` 경고/오류 알림
- `~/.claude/history.jsonl`, `~/.claude/projects/` 자동 수집 (내장 컬렉터)
- 대시보드: agent / workflow / source / alerts / 최근 이벤트
- 토큰 지표: 총 토큰(`totals.tokenTotal`) + 에이전트별 토큰(`agents[].tokenTotal`)
- 비용 지표: 총 비용(`totals.costTotalUsd`) 소수점 4자리 표시

## 실행

```bash
cargo run --release
```

브라우저에서 `http://localhost:5050` 열기

### 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `5050` | 서버 포트 |
| `HOST` | `127.0.0.1` | 바인드 주소 |
| `CLAUDE_HOME` | `~/.claude` | Claude 데이터 디렉토리 |
| `CLAUDE_POLL_MS` | `2500` | 데이터 수집 주기 (ms) |
| `CLAUDE_BACKFILL_LINES` | `25` | 초기 로드 시 읽을 라인 수 |
| `MONITOR_API_KEY` | (없음) | 설정 시 `POST /api/events`에 `x-api-key` 헤더 필수 |
| `PUBLIC_DIR` | `public` | 정적 파일 디렉토리 경로 |
| `HTTP_READ_TIMEOUT_SEC` | `5` | HTTP 읽기 타임아웃 (초) |

## 데스크톱 앱

```bash
npm install
npm run desktop:start
```

Electron 창에서 Rust 서버를 내부적으로 기동합니다.

## 검증

```bash
cargo fmt --check       # 포맷 검사
cargo clippy -- -D warnings  # 린트
cargo test              # Rust 테스트
npm run check           # JS 구문 검사
```

연결 상태는 헤더 배지에서 `connected / reconnecting / offline`으로 확인할 수 있습니다.
