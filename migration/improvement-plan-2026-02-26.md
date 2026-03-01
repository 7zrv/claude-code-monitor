# Improvement Plan (2026-02-26)

> 코드리뷰 결과를 기반으로 한 구체적 개선 계획.
> 이전 리뷰(`improvement-review-2026-02-25.md`)의 후속 문서.

## 변경 이력
| 날짜 | 내용 |
|------|------|
| 2026-02-26 | 초안 작성 (코드리뷰 기반) |
| 2026-02-26 | 검토 반영: 코드 예시 보완, 사실 관계 수정, 누락 항목 추가, 수락 기준 구체화 |
| 2026-02-26 | 디자인 리뷰 반영: Design Phase D0~D2 추가 (데스크톱 전용 — 모바일 대응 제외) |
| 2026-02-26 | 2차 검토 반영: 라인 넘버 갱신, 완료 상태 반영, 사실 관계 수정, Design Phase 중복 제거, font-size 스케일 보정, Node token 미지원 명시 |

---

## Phase 0 — 즉시 수정 (Critical / Hotfix) `✅ 적용 완료`

목표: 보안 취약점과 데이터 정합성 버그를 즉시 제거한다.

> **Phase 0 전 항목은 코드 반영이 완료되었습니다.** 아래 내용은 적용된 수정의 레퍼런스입니다.

### 0-1. Path Traversal 방어 `✅ 완료`

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical** |
| 파일 | `src/main.rs:484` (`serve_static`), `server.js:199` (`serveStatic`) |
| 수정 내역 | Rust: `canonicalize()` 후 `public_dir` prefix 검증. Node: `path.resolve()` 후 `PUBLIC_DIR_ABS` prefix 검증 |
| 담당 | backend |

**Rust 적용 코드:**
```rust
fn serve_static(app: &App, path: &str) -> Vec<u8> {
    let clean = if path == "/" { "/index.html" } else { path };
    let rel = clean.trim_start_matches('/');
    let full = app.public_dir.join(rel);

    // canonicalize 후 public_dir 하위인지 검증
    let canonical = match full.canonicalize() {
        Ok(p) => p,
        Err(_) => return json_response(
            "404 Not Found",
            &json!({ "error": "Not found" }).to_string(),
        ),
    };
    let base = match app.public_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return json_response(
            "500 Internal Server Error",
            &json!({ "error": "Internal error" }).to_string(),
        ),
    };
    if !canonical.starts_with(&base) {
        return json_response(
            "403 Forbidden",
            &json!({ "error": "Forbidden" }).to_string(),
        );
    }

    match read(canonical) {
        Ok(bytes) => bytes_response("200 OK", &bytes, content_type_for(clean)),
        Err(_) => json_response(
            "404 Not Found",
            &json!({ "error": "Not found" }).to_string(),
        ),
    }
}
```

**Node 적용 코드:**
```js
const PUBLIC_DIR_ABS = path.resolve(PUBLIC_DIR);

async function serveStatic(pathname, res) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR_ABS)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }
  // ... 기존 readFile / writeHead / end 로직
}
```

**수락 기준:**
- `GET /../Cargo.toml`, `GET /%2e%2e/Cargo.toml` 등에 대해 403 또는 404 반환
- `public/` 내부 파일은 정상 서빙

**자동 검증:**
```bash
# Rust 서버 기동 후
curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5050/../Cargo.toml'   # 기대: 403 또는 404
curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5050/%2e%2e/Cargo.toml' # 기대: 403 또는 404
curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5050/index.html'       # 기대: 200
```

---

### 0-2. XSS 방어 `✅ 완료`

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical** |
| 파일 | `public/app.js` (전체 렌더 함수) |
| 수정 내역 | `escapeHtml` 유틸 함수 추가 및 모든 동적 값 삽입에 적용 |
| 담당 | frontend |

**적용 코드:**
```js
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
```

**적용 대상 (innerHTML 내 외부 데이터 삽입 전체):**
- `renderCards`: `label`, `value` — label은 코드 상수이므로 제외, value는 `Intl.NumberFormat` 결과이므로 제외
- `renderWorkflow`: `row.roleId`, `row.status`, `row.lastEvent`
- `renderSources`: `row.source`
- `renderAgents`: `row.agentId`, `row.lastEvent`
- `renderEvents`: `evt.agentId`, `evt.event`, `evt.message`
- `renderAlerts`: `alert.agentId`, `alert.event`, `alert.message`
- `statusPill`: `status` 인자
- `renderThroughputChart`: 바 차트 `data-label` 속성

**수락 기준:**
- `agentId`가 `<img src=x onerror=alert(1)>`인 이벤트를 POST 후 대시보드에서 스크립트 실행되지 않음

**자동 검증:**
```bash
# 악성 페이로드 전송
curl -X POST http://localhost:5050/api/events \
  -H 'content-type: application/json' \
  -d '{"agentId":"<img src=x onerror=alert(1)>","event":"test","status":"ok"}'

# 이후 대시보드 DOM 검사에서 &lt;img 형태로 이스케이프 확인
curl -s http://localhost:5050/api/events | grep -o '&lt;img'  # 기대: 매치 없음 (JSON에서는 원본 유지)
# → 브라우저 대시보드에서 수동 확인 필요
```

---

### 0-3. `readTailLines` 버그 수정 `✅ 완료`

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical** (기능 장애) |
| 파일 | `scripts/claude-local-collector.js:245` |
| 수정 내역 | `.split('\\n')` (리터럴 백슬래시+n) → `.split('\n')` (개행 문자)으로 수정 |
| 담당 | backend |

> 참고: 같은 파일의 `readDelta` 함수(96행)에서는 `.split('\n')`으로 올바르게 사용하고 있었음

**수정:**
```js
// scripts/claude-local-collector.js:245
// Before
.split('\\n')

// After
.split('\n')
```

**수락 기준:**
- `npm run collect:claude` 실행 시 기존 history.jsonl에서 최근 N줄이 정상 backfill됨

---

### 0-4. Node `server.js` API Key 검증 추가 `✅ 완료`

| 항목 | 내용 |
|------|------|
| 심각도 | **High** |
| 파일 | `server.js:265` (`POST /api/events` 핸들러), `server.js:11` (API_KEY 상수) |
| 수정 내역 | Rust 서버와 동일한 `x-api-key` 헤더 검증 추가 |
| 담당 | backend |

**적용 코드:**
```js
const API_KEY = process.env.MONITOR_API_KEY || '';

// POST /api/events 핸들러 내부, parseJsonBody 전에:
if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
  res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return;
}
```

> **참고: Node `server.js`에는 token tracking(`tokenTotal`)이 미구현 상태입니다.** Rust 서버의 `AgentRow.token_total`, `State.token_total`, `Snapshot.totals.tokenTotal`에 해당하는 기능이 Node에는 없습니다. Phase 3-1 legacy 정리 전까지 Node 서버를 사용하면 토큰 집계가 누락됩니다.

**수락 기준:**
- `MONITOR_API_KEY=secret node server.js` 기동 후 API Key 없이 POST 시 401 반환
- API Key 미설정 시 기존처럼 자유 접근 가능

---

## Phase 1 — 보안 강화 + 안정성 개선 (1~2주)

### ~~1-1. 기본 바인딩 주소 변경~~ `✅ 이미 적용됨`

| 항목 | 내용 |
|------|------|
| 심각도 | ~~**High**~~ → 해결됨 |
| 파일 | `src/main.rs:926`, `server.js:8` |
| 현재 상태 | 양쪽 서버 모두 기본값이 이미 `127.0.0.1`. 추가 작업 불필요 |

확인:
- Rust: `std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string())`
- Node: `const HOST = process.env.HOST || '127.0.0.1';`

---

### 1-2. Rust HTTP 파서 안정화 (잔여 작업)

| 항목 | 내용 |
|------|------|
| 심각도 | **High** |
| 파일 | `src/main.rs:360` (`parse_request`) |
| 현상 | 수동 HTTP 파서의 한계: chunked transfer encoding 미지원 |
| 적용 완료 | POST body 1MB 제한 (`main.rs:407`), read timeout 환경변수화 (`main.rs:361`, `HTTP_READ_TIMEOUT_SEC`, 기본 5초) |
| 잔여 작업 | chunked TE 요청 시 적절한 에러 반환. 중기: `axum` 전환 (Phase 2) |
| 담당 | backend |

> 참고: `buf`(8192바이트)는 읽기 단위 버퍼이며, `data: Vec<u8>`에 누적하여 헤더 상한은 실질적으로 2MB(`data.len() > 2 * 1024 * 1024`). 실제 문제는 버퍼 크기가 아니라 파싱 로직의 불완전성.

**잔여 수정 범위:**
```rust
// chunked transfer encoding 감지 시 에러 반환
if headers.get("transfer-encoding").map(|v| v.contains("chunked")).unwrap_or(false) {
    return None; // chunked 미지원 — 클라이언트에 400 반환
}
```

**수락 기준:**
- chunked transfer encoding 요청에 대해 깨지지 않고 에러 반환

---

### 1-3. SSE 클라이언트 누수 방지

| 항목 | 내용 |
|------|------|
| 심각도 | **High** |
| 파일 | `src/main.rs:355` (`broadcast_sse`), `src/main.rs:511` (`handle_sse`) |
| 현상 | 이벤트가 들어오지 않는 동안 끊어진 SSE 연결이 정리되지 않음 |
| 수정 방향 | keepalive 전송 시 실패한 채널을 정리하는 주기적 sweeper 추가 |
| 담당 | backend |

**수정 방향:**
```rust
fn spawn_sse_sweeper(app: App) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(30));
            let mut clients = app.sse_clients.lock().unwrap_or_else(|e| e.into_inner());
            clients.retain(|tx| tx.send(": keepalive\n\n".to_string()).is_ok());
        }
    });
}
```

> 참고: `handle_sse`는 스레드 내부에서 15초마다 keepalive를 보내고 write 실패 시 루프를 종료하지만, 해당 스레드의 `Sender`는 `sse_clients` 벡터에 남아 있다. sweeper가 `send()` 실패를 통해 이를 제거한다.

**수락 기준:**
- 클라이언트 100개 연결 후 전부 끊었을 때 30초 이내에 `sse_clients` 비워짐

---

### 1-4. Mutex 패닉 방어

| 항목 | 내용 |
|------|------|
| 심각도 | **Medium** |
| 파일 | `src/main.rs` — 6곳 (266, 356, 555, 562, 569, 573행) |
| 현상 | 다른 스레드 패닉 시 Mutex가 poisoned되어 전체 서버 크래시 |
| 수정 방향 | `.lock().expect(...)` → `.lock().unwrap_or_else(\|e\| e.into_inner())` 패턴으로 일괄 교체 |
| 담당 | backend |

**수락 기준:**
- poisoned mutex 상황에서도 서버가 계속 동작

---

## Phase 2 — 성능 최적화 + 구조 개선 (2~4주)

### 2-1. HTTP 프레임워크 전환 (axum)

| 항목 | 내용 |
|------|------|
| 심각도 | **Medium** |
| 파일 | `src/main.rs` 전체, `Cargo.toml` |
| 현상 | 수동 HTTP 파서의 한계 (chunked, keep-alive, pipelining 미지원) |
| 수정 방향 | `axum` + `tokio` 기반으로 전환. SSE는 `axum::response::Sse` 활용 |
| 담당 | backend |

**의존성 변경:**
```toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.6", features = ["fs", "cors"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**전환 시 주의사항:**
- `parse_log_event`는 `active_role: &mut String` 상태를 추적함 (`src/main.rs:686`). 수집기 스레드 내부 상태이므로 axum 핸들러와 분리하여 유지 필요
- `extract_u64_after` 유틸 함수(`src/main.rs:170`) 이전 포함
- `tower-http`의 `CorsLayer` 추가하여 외부 프론트엔드 접근 지원

**수락 기준:**
- 기존 API 계약(`/api/health`, `/api/events`, `/api/alerts`, `/api/stream`) 100% 호환
- `npm run check` 통과
- 부하 테스트(`npm run test:frontend:load`) 통과
- CORS 헤더 포함 확인

---

### 2-2. 프론트엔드 렌더링 최적화

| 항목 | 내용 |
|------|------|
| 심각도 | **Medium** |
| 파일 | `public/app.js` |
| 현상 | 모든 업데이트마다 `innerHTML` 전체 교체 → 스크롤 초기화, DOM 부하 |
| 수정 방향 | 이벤트 리스트: 새 이벤트 prepend + 초과분 trim. 카드/테이블: 값만 textContent 업데이트 |
| 담당 | frontend |

**수정 전략:**
1. 카드: 초기 렌더 시 DOM 요소 캐시 → 값만 `textContent`로 업데이트
2. 이벤트 목록: 새 이벤트는 `prepend()`, 초과 행은 `removeChild()`
3. 에이전트 테이블: 행 단위 diff 업데이트 (토큰 컬럼 포함)

**수락 기준:**
- 이벤트 수신 중 스크롤 위치가 유지됨
- `LOAD_EVENTS_PER_SEC=20`에서 UI 프리즈 없음

---

### 2-3. 불필요한 폴링 제거

| 항목 | 내용 |
|------|------|
| 심각도 | **Low** |
| 파일 | `public/app.js` (하단 초기화 영역, 567행) |
| 현상 | SSE 연결 활성 중에도 10초 폴링(`setInterval`)이 계속 동작 |
| 수정 방향 | SSE 연결 상태에 따라 폴링 활성/비활성 전환 |
| 담당 | frontend |

**수정 예시:**
```js
let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => loadSnapshot().catch(console.error), 10000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// SSE onopen → stopPolling()
// SSE onerror → startPolling()
```

**수락 기준:**
- SSE 연결 중 `/api/events` 폴링 요청 없음 (네트워크 탭 확인)
- SSE 끊김 시 폴링 자동 복구

---

### 2-4. RwLock 전환

| 항목 | 내용 |
|------|------|
| 심각도 | **Low** |
| 파일 | `src/main.rs:17` (`App.state`) |
| 현상 | `Mutex`로 읽기/쓰기 모두 직렬화 → SSE snapshot 전송 시 쓰기 차단 |
| 수정 방향 | `Mutex<State>` → `RwLock<State>`. 읽기(snapshot 생성)는 `read()`, 쓰기(이벤트 추가)는 `write()` |
| 담당 | backend |

**수락 기준:**
- 동시 SSE 클라이언트 50개 + 이벤트 POST 10/sec에서 응답 지연 p95 < 50ms

---

## Phase 3 — 기술 부채 정리 (4주+)

### 3-1. 중복 코드 제거 및 legacy 정리

| 항목 | 내용 |
|------|------|
| 파일 | `server.js`, `scripts/claude-local-collector.js` |
| 현상 | Rust 서버와 동일한 로직이 Node.js에 중복 존재. 동시 실행 시 이벤트 중복 수집. Node 서버는 token tracking 미구현으로 기능 패리티 부족 |
| 수정 방향 | Node 서버와 collector를 `legacy/` 디렉터리로 이동. package.json에서 `start` 스크립트를 Rust로 변경 |
| 담당 | lead |

**변경 사항:**
```
legacy/
  server.js          ← 기존 server.js
  collector.js       ← 기존 scripts/claude-local-collector.js
```

```json
// package.json
"scripts": {
  "start": "cargo run --release",
  "start:legacy": "node legacy/server.js",
  ...
}
```

**수락 기준:**
- `npm start`가 Rust 서버를 실행
- legacy 경로는 문서에 명시되고 별도 실행 가능

---

### 3-2. Cargo.toml edition 수정

| 항목 | 내용 |
|------|------|
| 파일 | `Cargo.toml` |
| 현상 | `edition = "2024"` — stable에서 미지원 (nightly 필요) |
| 수정 방향 | `"2021"`로 변경 (의도적 nightly 사용이 아닌 경우) |
| 담당 | backend |

---

### 3-3. SQLite 영속화

| 항목 | 내용 |
|------|------|
| 파일 | `src/main.rs` (신규 모듈) |
| 현상 | 프로세스 재시작 시 모든 이벤트/알림/집계 손실 |
| 수정 방향 | `rusqlite` 기반 로컬 SQLite DB 추가. 시작 시 복원, 이벤트 수신 시 저장 |
| 담당 | backend |

**테이블 설계 (초안):**
```sql
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  event       TEXT NOT NULL,
  status      TEXT NOT NULL,
  latency_ms  INTEGER,
  message     TEXT,
  metadata    TEXT,  -- JSON (tokenUsage 등 포함)
  timestamp   TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE alerts (
  id         TEXT PRIMARY KEY,
  severity   TEXT NOT NULL,
  agent_id   TEXT NOT NULL,
  event      TEXT NOT NULL,
  message    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sources (
  source    TEXT PRIMARY KEY,
  total     INTEGER NOT NULL DEFAULT 0,
  ok        INTEGER NOT NULL DEFAULT 0,
  warning   INTEGER NOT NULL DEFAULT 0,
  error     INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL
);

CREATE INDEX idx_events_received ON events(received_at DESC);
CREATE INDEX idx_events_agent    ON events(agent_id);
CREATE INDEX idx_events_source   ON events(json_extract(metadata, '$.source'));
CREATE INDEX idx_alerts_created  ON alerts(created_at DESC);
```

> `by_agent` 집계는 `events` 테이블에서 `GROUP BY agent_id`로 복원 가능하므로 별도 테이블 불필요.
> `by_source` 집계는 `sources` 테이블에서 직접 복원하거나, `events.metadata`의 `source` 필드로 재계산 가능.
> `token_total`은 `events.metadata`의 `tokenUsage.totalTokens` 합산으로 복원.

**수락 기준:**
- 서버 재시작 후 최근 200건 이벤트와 120건 알림 복원 확인
- agent별 `token_total` 합산이 재시작 전후 일치
- DB 파일 경로는 환경변수로 설정 가능 (`MONITOR_DB_PATH`, 기본: `./monitor.db`)

---

## Design Phase — UI/디자인 개선 (데스크톱 전용)

> 본 프로젝트는 Electron 데스크톱 앱으로만 사용되므로 모바일 반응형은 대상에서 제외한다.

### D0. 색상 대비비 개선

| 항목 | 내용 |
|------|------|
| 심각도 | **P0 (Critical)** |
| 파일 | `public/styles.css:1-4`, `migration/tokens.md` |
| 현상 | 본문 텍스트 `#E26D5C` on `#F6EDE3` 대비비 ~2.3:1 — WCAG AA 기준 4.5:1 크게 미달. 장시간 모니터링 시 눈 피로 유발 |
| 수정 방향 | 2색 제약 유지. 텍스트 전용 명도 보정 변수 `--warm-text` 도입 (동일 색조의 어두운 변형) |
| 담당 | designer + frontend |

**수정:**
```css
/* public/styles.css */
:root {
  --warm: #E26D5C;
  --warm-text: #B84A3A;   /* 텍스트용 — 대비비 ~4.6:1 on #F6EDE3 */
  --paper: #F6EDE3;
}

body {
  color: var(--warm-text);  /* 기존 var(--warm) → var(--warm-text) */
}

/* 장식 요소(border, background gradient)는 기존 --warm 유지 */
```

**tokens.md 업데이트:**
```markdown
## Color
- `--warm`: `#E26D5C` (장식용: border, gradient, SVG)
- `--warm-text`: `#B84A3A` (텍스트용: body, label, heading)
- `--paper`: `#F6EDE3`

## Rule
- 추가 색상 금지. `--warm-text`는 `--warm`의 명도 보정이며 새로운 색이 아님
- 텍스트에는 반드시 `--warm-text` 사용 (WCAG AA 4.5:1 이상)
- border, gradient, SVG fill/stroke에는 `--warm` 사용
```

**적용 범위:**
- `body` color — `th`, 일반 텍스트 등은 `body`에서 상속되므로 자동 적용
- `.card .label`, `.header p`, `.header small` — opacity로 추가 감쇄하고 있으므로 기반 색이 충분히 어두워야 함
- `select`, `input[type='search']` color — `var(--warm)` → `var(--warm-text)` 명시 변경 필요

**수락 기준:**
- 본문 텍스트 대비비 4.5:1 이상 (Chrome DevTools > Rendering > CSS Overview로 확인)
- 기존 UI 분위기(Her 톤) 유지 — warm 계열 색조 동일

---

### D1-1. `error` / `blocked` 상태 시각 강화

| 항목 | 내용 |
|------|------|
| 심각도 | **P1** |
| 파일 | `public/styles.css` (`.status-pill` 규칙) |
| 현상 | `error`는 `solid 2px`, `ok`는 `solid 1px` — 11px pill에서 두께 차이만으로 구분 어려움 |
| 수정 방향 | `error`에 `double` border-style + 볼드 텍스트, `blocked`에 동일 적용 |
| 담당 | designer + frontend |

**수정:**
```css
.status-pill[data-status='error'] {
  border-width: 2px;
  border-style: double;
  font-weight: 700;
}

.status-pill[data-status='blocked'] {
  border-width: 2px;
  border-style: double;
  font-weight: 700;
}
```

**수락 기준:**
- error/blocked pill이 ok pill과 5초 이내에 구분 가능 (시각적 즉시 인지)

---

### D1-2. Workflow 상태 pill CSS 추가

| 항목 | 내용 |
|------|------|
| 심각도 | **P1** |
| 파일 | `public/styles.css` |
| 현상 | `at-risk`, `running`, `idle` 상태에 대한 `.status-pill[data-status]` 규칙 없음. 모두 기본 `solid 1px`로 렌더링 |
| 수정 방향 | 각 workflow 상태에 고유한 border 패턴 부여 |
| 담당 | designer + frontend |

> `blocked`는 D1-1에서 정의 완료. 여기서는 나머지 3개 상태만 추가.

**수정:**
```css
.status-pill[data-status='running'] {
  border-width: 2px;
  border-style: solid;
}

.status-pill[data-status='at-risk'] {
  border-style: dashed;
  font-weight: 600;
}

.status-pill[data-status='idle'] {
  border-style: dotted;
  opacity: 0.6;
}
```

**상태별 시각 구분 총정리:**

| 상태 | style | width | weight | 추가 | 용도 |
|------|-------|-------|--------|------|------|
| `ok` | solid | 1px | normal | — | 이벤트 정상 |
| `warning` | dashed | 1px | normal | — | 이벤트 경고 |
| `error` | double | 2px | 700 | — | 이벤트 에러 |
| `connected` | solid | 1px | normal | — | 연결 정상 |
| `reconnecting` | dashed | 1px | normal | — | 재연결 중 |
| `offline` | dotted | 2px | normal | — | 연결 끊김 |
| `running` | solid | 2px | normal | — | 워크플로우 실행 중 |
| `at-risk` | dashed | 1px | 600 | — | 워크플로우 주의 |
| `blocked` | double | 2px | 700 | — | 워크플로우 차단 |
| `idle` | dotted | 1px | normal | opacity 0.6 | 워크플로우 대기 |

**수락 기준:**
- 4가지 workflow 상태가 Workflow 진행 현황 패널에서 각각 구분 가능

---

### D1-3. tokens.md 디자인 토큰 보완

| 항목 | 내용 |
|------|------|
| 심각도 | **P1** |
| 파일 | `migration/tokens.md` |
| 현상 | font-size 6단계, spacing 13종, border-radius 5종이 매직넘버로 CSS에 산재. tokens.md에는 Color, Typography(패밀리만), Status Language만 존재 |
| 수정 방향 | 실제 CSS에서 사용 중인 값을 정리하여 토큰으로 문서화 |
| 담당 | designer |

**tokens.md에 추가할 내용:**
```markdown
## Font Size Scale
- `--text-xs`: `10px` — 차트 축, 레전드
- `--text-sm`: `11px` — badge, status-pill, 레전드 항목
- `--text-caption`: `12px` — 카드 라벨 (.card .label)
- `--text-base`: `13px` — 이벤트 행
- `--text-md`: `14px` — 테이블 본문, 차트 제목
- `--text-lg`: `29px` — 카드 메트릭 값

> 위 6단계 외의 font-size 사용 금지

## Spacing Scale (4px 기반)
- `--space-1`: `4px` — 최소 간격 (gap, padding 내부)
- `--space-2`: `8px` — 기본 gap, 패널 내부 간격
- `--space-3`: `12px` — 카드/패널 padding
- `--space-4`: `16px` — 섹션 간 margin
- `--space-5`: `24px` — 큰 간격
- `--space-6`: `32px` — 헤더 영역

> 9px, 34px 등 스케일 외 값은 가장 가까운 스케일 값으로 정규화

## Border Radius
- `--radius-sm`: `6px` — tooltip
- `--radius-md`: `8px` — input, select, 차트 영역
- `--radius-lg`: `10px` — 이벤트 행, 워크플로우 아이템, 차트 카드
- `--radius-xl`: `14px` — 카드, 패널
- `--radius-pill`: `999px` — badge, status-pill, 레전드

## Background Gradient
- 사용 가능: `radial-gradient`에 `--warm`을 10~20% 투명도로 사용
- 최대 2개 그라데이션 레이어
```

**수락 기준:**
- tokens.md에 Color, Typography, Font Size, Spacing, Border Radius, Gradient, Status 전 항목 포함

> CSS 변수 실제 적용(매직넘버 → 변수 교체)은 Phase 2 렌더링 최적화와 함께 진행 가능

---

### D2-1. 차트 축 라벨 추가

| 항목 | 내용 |
|------|------|
| 심각도 | **P2** |
| 파일 | `public/app.js` (`renderThroughputChart`, `renderTokenTrendChart`) |
| 현상 | X축 시간 라벨 없음, Y축 `max N`만 표시 — 차트 범위와 스케일 파악 어려움 |
| 수정 방향 | 두 차트 모두에 X축 5~10분 간격 시간 라벨, Y축 50% 눈금선 추가 |
| 담당 | frontend |

**수정 예시 (throughput 차트 — `renderThroughputChart`):**
```js
// Y축 50% 눈금선
const midY = top + chartHeight / 2;
const midLine = `<line x1="${left}" y1="${midY}" x2="${right}" y2="${midY}" stroke="rgb(226 109 92 / 15%)" stroke-width="1" stroke-dasharray="4 4" />`;
const midLabel = `<text x="${left}" y="${midY - 4}" font-size="9" fill="rgb(226 109 92 / 50%)">${Math.round(max / 2)}</text>`;

// X축 시간 라벨 (6개 포인트: 0, 5, 10, 15, 20, 25분)
const xLabels = [0, 5, 10, 15, 20, 25].map((minAgo) => {
  const idx = 30 - minAgo - 1;
  if (idx < 0 || idx >= buckets.length) return '';
  const x = left + idx * slot + slot / 2;
  const label = minAgo === 0 ? 'now' : `-${minAgo}m`;
  return `<text x="${x}" y="${bottom + 14}" font-size="9" text-anchor="middle" fill="rgb(226 109 92 / 60%)">${label}</text>`;
}).join('');
```

**token trend 차트 (`renderTokenTrendChart`)도 동일 패턴 적용:**
```js
// Y축 50% 눈금선 (width/height 객체 사용)
const midY = height.top + (height.bottom - height.top) / 2;
const midLine = `<line x1="${width.left}" y1="${midY}" x2="${width.right}" y2="${midY}" stroke="rgb(226 109 92 / 15%)" stroke-width="1" stroke-dasharray="4 4" />`;
const midLabel = `<text x="${width.left}" y="${midY - 4}" font-size="9" fill="rgb(226 109 92 / 50%)">${Math.round(max / 2)}</text>`;

// X축 시간 라벨 (throughput과 동일한 6개 포인트)
const slotWidth = (width.right - width.left) / (buckets.length - 1 || 1);
const xLabels = [0, 5, 10, 15, 20, 25].map((minAgo) => {
  const idx = 30 - minAgo - 1;
  if (idx < 0 || idx >= buckets.length) return '';
  const x = width.left + idx * slotWidth;
  const label = minAgo === 0 ? 'now' : `-${minAgo}m`;
  return `<text x="${x}" y="${height.bottom + 14}" font-size="9" text-anchor="middle" fill="rgb(226 109 92 / 60%)">${label}</text>`;
}).join('');
```

**수락 기준:**
- 두 차트 모두에서 시간 범위와 값 스케일을 라벨만으로 파악 가능

---

### D2-2. 차트 접근성 속성 추가

| 항목 | 내용 |
|------|------|
| 심각도 | **P2** |
| 파일 | `public/index.html` (SVG 요소), `public/app.js` (SVG innerHTML) |
| 현상 | SVG 차트에 `role`, `aria-label`, `<title>` 없음 — 스크린리더에 정보 미전달 |
| 수정 방향 | SVG에 `role="img"` + `aria-label` 추가, innerHTML 렌더 시 `<title>` 포함 |
| 담당 | frontend |

**HTML 수정:**
```html
<svg id="throughputChart" class="throughput-chart" role="img"
     aria-label="분당 이벤트 처리량 바 차트" viewBox="0 0 640 220" preserveAspectRatio="none">
</svg>
<svg id="tokenTrendChart" class="token-trend-chart" role="img"
     aria-label="에이전트별 분당 토큰 사용량 추이 차트" viewBox="0 0 640 220" preserveAspectRatio="none">
</svg>
```

**수락 기준:**
- 스크린리더에서 차트 영역 진입 시 설명 텍스트 읽힘

---

## Design Phase 역할별 담당 요약

| Phase | 항목 | 담당 | 의존 |
|-------|------|------|------|
| **D0** | 색상 대비비 개선 | designer + frontend | - |
| **D1** | error/blocked pill 강화 | designer + frontend | D0 완료 |
| **D1** | workflow 상태 pill CSS (running/at-risk/idle) | designer + frontend | D0 완료 |
| **D1** | tokens.md 보완 | designer | - (독립) |
| **D2** | 차트 축 라벨 | frontend | - |
| **D2** | 차트 접근성 | frontend | - |

---

## Design Phase 수락 기준 종합

### D0 (즉시)
- 본문 텍스트 대비비 4.5:1 이상 (Chrome DevTools 확인)
- UI 분위기(Her 톤 warm 계열) 변경 없음

### D1 (1~2주)
- error/blocked/at-risk/running/idle 각각 시각적으로 즉시 구분 가능
- tokens.md에 Font Size(6단계), Spacing, Border Radius, Gradient 규칙 포함

### D2 (2~4주)
- 두 차트 모두 시간/값 스케일을 라벨만으로 파악 가능
- SVG 차트에 `aria-label` 존재

---

## 역할별 담당 요약

| Phase | 항목 | 담당 | 의존 | 상태 |
|-------|------|------|------|------|
| **0** | Path Traversal 방어 | backend | - | ✅ 완료 |
| **0** | XSS 방어 | frontend | - | ✅ 완료 |
| **0** | readTailLines 버그 | backend | - | ✅ 완료 |
| **0** | Node API Key 검증 추가 | backend | - | ✅ 완료 |
| **D0** | 색상 대비비 개선 | designer + frontend | - | 미착수 |
| ~~**1**~~ | ~~기본 바인딩 변경~~ | ~~backend~~ | — | ✅ 이미 적용 |
| **1** | HTTP 파서 안정화 (chunked TE 처리) | backend | Phase 0 완료 | 미착수 |
| **1** | SSE 누수 방지 | backend | Phase 0 완료 | 미착수 |
| **1** | Mutex 패닉 방어 | backend | Phase 0 완료 | 미착수 |
| **D1** | error/blocked pill 강화 | designer + frontend | D0 완료 | 미착수 |
| **D1** | workflow 상태 pill CSS | designer + frontend | D0 완료 | 미착수 |
| **D1** | tokens.md 보완 | designer | - (독립) | 미착수 |
| **2** | axum 전환 (CORS 포함) | backend | Phase 1 완료 | 미착수 |
| **2** | 렌더링 최적화 | frontend | 0-2 XSS 방어 완료 | 미착수 |
| **2** | 폴링 제거 | frontend | - (독립, 2-2와 병렬 수행 가능) | 미착수 |
| **2** | RwLock 전환 | backend | Phase 1 완료 | 미착수 |
| **D2** | 차트 축 라벨 | frontend | - (독립) | 미착수 |
| **D2** | 차트 접근성 | frontend | - (독립) | 미착수 |
| **3** | legacy 정리 | lead | Phase 2 완료 | 미착수 |
| **3** | edition 수정 | backend | - (독립) | 미착수 |
| **3** | SQLite 영속화 | backend | Phase 2 완료 | 미착수 |

---

## 수락 기준 종합

Phase 완료 판정은 아래 기준을 모두 충족해야 한다:

### Phase 0 (즉시) `✅ 코드 반영 완료 — 수동 검증 잔여`
- Path Traversal 자동 검증 스크립트 통과:
  ```bash
  curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5050/../Cargo.toml'      # != 200
  curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5050/%2e%2e/Cargo.toml'  # != 200
  curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5050/index.html'          # == 200
  ```
- XSS 페이로드 POST 후 대시보드에서 스크립트 미실행 (수동 확인)
- `npm run collect:claude`에서 backfill 정상 동작 확인
- Node 서버 `MONITOR_API_KEY` 검증 동작 확인

### Phase 1 (1~2주)
- `npm run check` + `cargo check` 통과
- 부하 테스트(`npm run test:frontend:load`) 통과
- chunked TE 요청에 에러 반환 확인
- SSE 클라이언트 단절 후 30초 이내 정리 확인

### Phase 2 (2~4주)
- 기존 API 계약 호환성 100%
- CORS 헤더 포함 확인
- UI 프리즈 없음 (`LOAD_EVENTS_PER_SEC=20`)
- SSE 재연결 10초 이내
- SSE 연결 중 불필요한 폴링 없음

### Design D0 (즉시, Phase 0과 병렬)
- 본문 텍스트 대비비 4.5:1 이상
- UI 분위기(Her 톤) 유지

### Design D1 (Phase 1과 병렬)
- error/blocked/at-risk/running/idle pill 각각 시각 구분 가능
- tokens.md에 Font Size(6단계), Spacing, Border Radius, Gradient 규칙 포함

### Design D2 (Phase 2와 병렬)
- 두 차트 모두 축 라벨로 시간/스케일 파악 가능
- SVG 차트에 `aria-label` 존재

### Phase 3 (4주+)
- `npm start` → Rust 실행
- 서버 재시작 후 이벤트/알림/토큰 집계 데이터 복원 확인
- `sources` 테이블 데이터 복원 확인
