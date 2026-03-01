# Claude Monitor — Claude Code 규칙

## 프로젝트 개요

Claude 에이전트의 실시간 모니터링 대시보드. Rust 백엔드 + Node.js 서버 + Electron 데스크톱 앱 구조.

## 기술 스택

- **Backend**: Rust (stable, edition 2021) — `src/main.rs`
- **Server**: Node.js >= 20 (ESM) — `server.js`
- **Desktop**: Electron — `desktop/main.js`
- **Dependencies**: serde, serde_json, time

## 프로젝트 구조

```
src/            Rust 백엔드
server.js       Node.js SSE 서버
public/         프론트엔드 정적 파일
desktop/        Electron 앱
scripts/        유틸리티 스크립트 (collector, load test)
migration/      마이그레이션 파일
.github/        CI, 이슈/PR 템플릿
.claude/skills/ Claude Code 스킬 (아래 워크플로우 참조)
```

## 빌드 · 검증 명령

```bash
cargo build             # Rust 빌드 (debug)
cargo build --release   # Rust 빌드 (release)
cargo fmt --check       # 포맷 검사
cargo clippy -- -D warnings  # 린트
cargo test              # Rust 테스트
cargo tarpaulin --fail-under 80  # 커버리지 검사 (최소 80%)
npm install             # Node 의존성 설치
npm run check           # Node 구문 검사 (전체 JS 파일)
npm start               # 서버 실행
```

## CI 파이프라인

`.github/workflows/ci.yml` — main push/PR 시 자동 실행:

1. `cargo fmt --check`
2. `cargo clippy -- -D warnings`
3. `cargo tarpaulin --fail-under 80` (테스트 + 커버리지)
4. `npm run check`

## 브랜치 보호

- `main`에 직접 푸시 불가 — 반드시 PR을 거쳐야 함
- PR 머지 조건: CI 통과 + 1명 이상 승인
- 어드민은 보호 규칙 우회 가능 (`enforce_admins: false`)
- 머지 시 소스 브랜치 자동 삭제

## 브랜치 · 커밋 컨벤션

[CONTRIBUTING.md](./CONTRIBUTING.md)를 따른다.

- **브랜치**: `feat/<name>`, `fix/<name>`, `docs/<name>`, `refactor/<name>`, `chore/<name>`
- **커밋**: Conventional Commits — `<type>(<scope>): <description>`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
- **Scopes**: `api`, `sse`, `ui`, `desktop`, `collector`, `docs`
- Subject line: lowercase, 70자 이내, 마침표 없음

## PR 규칙

- PR 템플릿(`.github/pull_request_template.md`)을 따른다.
- 관련 이슈가 있으면 본문에 `Closes #이슈번호`를 포함한다.
- PR 제목은 Conventional Commit 스타일, 70자 이내.

## 이슈 생성 규칙

### 라벨

이슈를 생성할 때 반드시 아래 라벨을 모두 부착한다.

| 구분 | 라벨 | 설명 |
|------|------|------|
| 상태 | `status: ready` | 생성 즉시 작업 가능 상태 |
| 우선순위 | `priority: high` / `priority: medium` / `priority: low` | 긴급도에 따라 1개 선택 |
| 카테고리 | `enhancement` / `documentation` / `bug` | 작업 성격에 따라 1개 선택 |

### 제목

- **한국어**로 작성한다.
- **동사형**으로 시작한다. (예: "추가하다", "수정하다", "개선하다")
- **70자 이내**로 작성한다.
- 예시: `CI 워크플로우에 캐싱 단계 추가하기`

### 본문 형식

```markdown
## 배경
<!-- 왜 이 작업이 필요한지 설명 -->

## 작업 내용
- [ ] 할 일 1
- [ ] 할 일 2

## 관련 파일
- `path/to/file.rs`

## 비고
<!-- 참고 사항, 관련 이슈 링크 등 -->
```

## 스킬 기반 워크플로우

프로젝트의 이슈 관리부터 PR까지 아래 스킬을 순서대로 사용한다:

```
/create-issue  → 이슈 생성
/start-issue   → 이슈 선택, 워크트리 생성, 상태 변경
/plan-issue    → 이슈 분석, 작업 계획(PLAN.md) 작성
  (구현)
/review-code   → 현재 브랜치 코드 리뷰
/commit        → 변경 사항 커밋
/push          → 리모트 푸시
/pr            → PR 생성
/review-pr     → PR 리뷰
```

## TDD (Test-Driven Development)

모든 구현은 반드시 TDD 방식으로 진행한다. **테스트 없는 구현 코드 작성을 금지한다.**

### Red-Green-Refactor 사이클

1. **Red** — 실패하는 테스트를 먼저 작성한다.
   - 구현할 기능의 기대 동작을 테스트로 정의한다.
   - `cargo test` 또는 해당 테스트 명령으로 테스트가 **실패하는 것을 확인**한다.
2. **Green** — 테스트를 통과하는 최소한의 구현 코드를 작성한다.
   - 테스트를 통과시키는 데 필요한 코드만 작성한다.
   - 불필요한 기능을 미리 추가하지 않는다.
3. **Refactor** — 테스트가 통과하는 상태를 유지하며 코드를 정리한다.
   - 중복 제거, 네이밍 개선, 구조 정리 등을 수행한다.
   - 리팩터링 후 테스트가 여전히 통과하는지 확인한다.

### TDD 규칙

- 구현 코드를 작성하기 **전에** 반드시 해당 기능의 테스트를 먼저 작성한다.
- 한 번에 하나의 테스트만 추가하고, 그 테스트를 통과시킨 후 다음 테스트로 넘어간다.
- 테스트 실행 결과(실패 → 성공)를 각 단계에서 확인한다.
- 커밋 시 모든 테스트가 통과해야 한다 (`cargo test` 성공).

### 테스트 작성 기준

- **Rust**: `#[cfg(test)]` 모듈 내에 `#[test]` 함수로 작성한다.
- **JS**: 해당 파일과 동일 디렉토리 또는 `__tests__/` 디렉토리에 테스트 파일을 둔다.
- 단위 테스트를 우선하고, 필요 시 통합 테스트를 추가한다.
- 경계값, 에러 케이스, 정상 케이스를 모두 커버한다.

### 테스트 커버리지

- **최소 커버리지: 80%** — 이 기준 미달 시 CI가 실패한다.
- 측정 도구: `cargo-tarpaulin`
- 커버리지 확인 명령: `cargo tarpaulin --fail-under 80`
- 새로운 코드를 작성할 때 기존 커버리지를 낮추지 않아야 한다.
- 커버리지가 부족하면 추가 테스트를 작성한 후 커밋한다.

## 코드 스타일

- Rust: `cargo fmt` 포맷 준수, `clippy` 경고 없어야 함
- JS: ESM (`import`/`export`), `node --check`로 구문 검증
- 보안 취약점 (injection, XSS 등) 절대 금지
