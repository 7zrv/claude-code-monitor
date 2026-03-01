# Rust Migration Role Plan

## 총괄 에이전트 (lead)
- 목표: Node/Electron 중심 구조에서 Rust 중심 구조로 이전
- 범위: 이벤트 수집, 상태 집계, SSE, 정적 대시보드 서빙, Claude 로컬 로그 수집
- 수락 기준:
  - Rust 바이너리 1개로 `/api/health`, `/api/events`, `/api/stream`, `/api/alerts` 제공
  - `~/.claude` 입력으로 이벤트가 수집됨
  - 기존 UI(`public/*`)가 그대로 동작

## 디자이너 에이전트 (designer)
- 결정: 기존 Her 톤/2색 제한을 유지하여 UI 변경 최소화
- 작업:
  - UI는 기존 정적 자산 재사용
  - 상태 표현 확장은 색상 추가 없이 패턴/텍스트 기반 유지

## 프론트 개발 에이전트 (frontend)
- 작업:
  - 기존 `public/app.js`, `public/index.html`, `public/styles.css` 유지
  - API 계약 변경 시 최소 수정
- 검증:
  - Rust 백엔드 연결 후 화면 렌더링 정상

## 기능 개발 에이전트 (backend)
- 작업:
  - Rust `std` 기반 HTTP 서버 구현
  - SSE 브로드캐스트, 상태 집계, 알림 집계
  - `~/.claude/history.jsonl`, `~/.claude/projects/` 폴링 수집기 내장
- 검증:
  - `cargo build` 성공
  - 스모크 테스트로 이벤트 적재 확인

## 진행 순서
1. Rust 툴체인 설치
2. Rust 서버/수집기 구현
3. 실행 스크립트/문서 갱신
4. 빌드/스모크 테스트
