# Claude Code Monitor

[![GitHub release](https://img.shields.io/github/v/release/7zrv/claude-code-monitor)](https://github.com/7zrv/claude-code-monitor/releases)
[![License](https://img.shields.io/github/license/7zrv/claude-code-monitor)](https://github.com/7zrv/claude-code-monitor/blob/main/LICENSE)
[![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust)](https://www.rust-lang.org/)

Claude Code 세션의 실시간 모니터링 대시보드. Rust 백엔드 + Electron 데스크톱 앱 구조.

## 핵심 기능

- `GET /api/events` 스냅샷
- `GET /api/stream` SSE 실시간 스트림
- `GET /api/alerts` 경고/오류 알림
- `~/.claude/history.jsonl`, `~/.claude/projects/` 자동 수집 (내장 컬렉터)
- 세션 중심 대시보드
  - 상단 요약 카드
  - `Needs Attention`
  - `Sessions Workspace`
  - `Alerts`
  - `Workflow`
  - `에이전트` 참고 표
  - 세션 타임라인 / 분석 차트 / 최근 이벤트 로그
- 세션 상태 모델: `active / idle / stuck / completed / failed`
  - `warning`은 attention reason으로 유지되고, `stuck`은 2분 이상 무응답일 때 표시됩니다.
  - `completed`는 terminal hint가 있거나 15분 이상 장기 무응답일 때만 보수적으로 판정합니다.
- 토큰 지표: 총 토큰(`totals.tokenTotal`) + 에이전트별 토큰(`agents[].tokenTotal`)
- 비용 지표: 총 비용(`totals.costTotalUsd`) 소수점 4자리 표시
- Alerts 패널에서 경고 횟수, 비용 spike, 토큰 spike 임계값을 로컬 기준으로 조정 가능하며 저장된 값은 브라우저 `localStorage`에서 기본값을 덮어씁니다.
- Alerts 패널은 raw warning/error와 별도로 세션 단위 `failed`, `stuck`, `cost spike` 파생 alert도 함께 보여줍니다.

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
| `PUBLIC_DIR` | `public` | 정적 파일 디렉토리 경로 |
| `HTTP_READ_TIMEOUT_SEC` | `5` | HTTP 읽기 타임아웃 (초) |
| `DESKTOP_SERVER_READY_TIMEOUT_MS` | `30000` | Electron이 Rust 서버 준비를 기다리는 최대 시간 (ms) |

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
npm run perf:gate       # 대량 이벤트 렌더 회귀 게이트
```

연결 상태는 헤더에서 `connected / reconnecting / offline`과 마지막 성공 시각으로 확인할 수 있습니다.
