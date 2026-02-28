# Rust Migration Progress

## Lead
- [x] 마이그레이션 범위/수락 기준 확정
- [x] 역할별 작업 분해 문서화
- [x] 역할별 개선점 리뷰 문서화 (`migration/improvement-review-2026-02-25.md`)
- [x] 릴리스 체크리스트 작성 (`migration/release-checklist.md`)
- [x] 운영 런북 작성 (`migration/ops-runbook.md`)
- [x] 코드리뷰 기반 개선 계획 수립 (`migration/improvement-plan-2026-02-26.md`)
- [x] Phase 0 (Critical 수정) 코드 반영 및 자동 검증
- [ ] Phase 0 (Critical 수정) 수동 검증 완료(XSS 브라우저 확인)
- [x] Phase 1 (보안 강화/안정성) 완료 확인 (Chunked TE 방어, SSE sweeper, Mutex poison 방어)
- [ ] 최종 릴리스 판단
- [x] 역할 재분배(Lead 경량화) 적용 (`agents/team.json`, `agents/runbook.md`, `scripts/dispatch.js`)

## Designer
- [x] 기존 2색(Her 톤) 유지 결정
- [x] UI 변경 최소화 결정
- [x] 상태 인지성 개선 과제 도출
- [x] 토큰 문서 작성 (`migration/tokens.md`)
- [x] 디자인 리뷰 기반 개선 계획 수립 (`improvement-plan-2026-02-26.md` Design Phase)
- [x] D0: 색상 대비비 개선 (`--warm-text` 도입)
- [x] D1: error/blocked/workflow 상태 pill 시각 강화
- [x] D1: tokens.md 보완 (font-size, spacing, radius, gradient)

## Frontend
- [x] 기존 정적 자산(`public/*`) 유지
- [x] Rust API camelCase 계약 확인
- [x] SSE/렌더링 최적화 개선 과제 도출
- [x] 연결 상태 인디케이터 추가
- [x] SSE 증분 업데이트 모드 착수
- [x] 이벤트 필터/검색/행수 제어 추가
- [x] 렌더 디바운싱(`requestAnimationFrame`) 적용
- [x] 자동 회귀/부하 테스트 수행 (`migration/frontend-regression-result-2026-02-25.md`)
- [x] 필터 상태 영속화(localStorage) 적용
- [x] 이벤트 필터 결과 카운트 표시 추가
- [x] XSS escape 적용(`escapeHtml`)
- [x] D0: `--warm-text` CSS 변수 적용 (designer와 협업)
- [x] D1: workflow 상태 pill CSS 적용
- [x] D2: 차트 축 라벨 추가
- [x] D2: 차트 접근성 속성 추가 (`aria-label`)
- [ ] 최종 상호작용 회귀 테스트(수동)

## Backend
- [x] Rust 프로젝트 생성 (`Cargo.toml`, `src/main.rs`)
- [x] API 구현 (`/api/health`, `/api/events`, `/api/alerts`, `/api/stream`)
- [x] SSE 브로드캐스트 구현
- [x] `.codex/history.jsonl`, `.codex/log/codex-tui.log` 수집 내장
- [x] source/agent/workflow/alerts 집계 구현
- [x] 파일감시/영속화/보안 개선 과제 도출
- [x] API Key 기반 입력 보호(`MONITOR_API_KEY`) 착수
- [x] Rust path traversal 방어(canonicalize + prefix check)
- [x] Rust HTTP read timeout 환경변수화 + POST body 1MB 제한
- [x] Node legacy API Key/path traversal 방어 반영
- [x] collector backfill split 버그 수정
- [x] 기본 바인딩 주소 `127.0.0.1` 적용 (Rust + Node 양쪽)
- [x] Phase 1: chunked TE 에러 처리
- [x] Phase 1: SSE sweeper 추가
- [x] Phase 1: Mutex 패닉 방어
- [ ] 성능/안정성 튜닝
