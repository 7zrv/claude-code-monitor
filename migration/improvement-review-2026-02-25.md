# Improvement Review (2026-02-25)

## 범위
- 프로젝트: `Codex Pulse`
- 기준일: 2026-02-25
- 역할: lead, designer, frontend, backend

## Lead (총괄 에이전트)
### 발견된 개선점
1. 릴리스 게이트가 문서화되어 있지 않아 품질 기준이 사람마다 다를 수 있음.
2. 운영 목표치(SLO/SLA)와 장애 대응 절차가 없음.
3. Rust 전환 후 Node 경로와 중복 실행 가능성이 있어 운영 혼선 위험이 있음.

### 액션
1. `release-checklist.md` 추가: 빌드/스모크/회귀/롤백 기준 명시.
2. SLO 정의: 이벤트 수집 지연 p95, API 응답 p95, 크래시율.
3. 실행 경로 단일화: Rust 경로를 기본값으로 고정하고 Node는 legacy로 분리.

### 수락 기준
- 릴리스 체크리스트를 통과하지 않으면 배포 금지.
- 장애 대응 runbook 1개 이상 작성.

## Designer (디자이너 에이전트)
### 발견된 개선점
1. 2색 제한 하에서 경고/오류 구분 가시성이 낮음.
2. 상태 우선순위(critical > warning > info)가 시각적으로 즉시 인지되지 않음.
3. 타이포/간격 시스템이 토큰 파일로 분리되어 있지 않음.

### 액션
1. 색상 추가 없이 패턴/아이콘/보더 두께 규칙 표준화.
2. 상태 배지 문구 규칙 통일 (`blocked`, `at-risk`, `running`, `idle`).
3. 디자인 토큰 문서(`tokens.md`) 추가: 폰트 크기, spacing scale, border radius.

### 수락 기준
- 색상은 `#E26D5C`, `#F6EDE3` 2개만 사용 유지.
- 상태 인지성 테스트(5초 내 상태 판별) 통과.

## Frontend (프론트 개발 에이전트)
### 발견된 개선점
1. SSE 수신 시 전체 스냅샷 재요청 구조라 이벤트량 증가 시 비효율.
2. 에러/재연결 상태가 UI에 드러나지 않아 끊김을 사용자가 인지하기 어려움.
3. 이벤트 리스트 가상화가 없어 장시간 사용 시 렌더 부하 가능.

### 액션
1. SSE incremental 업데이트 모드 추가(전체 fetch fallback 유지).
2. 연결 상태 인디케이터 추가(connected/reconnecting/offline).
3. 최근 이벤트 렌더링 최적화(가시 범위 렌더 또는 row cap 전략 명시).

### 수락 기준
- 네트워크 단절 후 자동 복구 10초 이내.
- 1분당 이벤트 500건 시 UI 프리즈 없음.

## Backend (기능 개발 에이전트)
### 발견된 개선점
1. 현재 `std::net` 수동 HTTP 파서로 엣지 케이스(대용량/헤더 변형) 대응 한계.
2. 수집이 폴링 기반(`CODEX_POLL_MS`)이라 완전 실시간이 아님.
3. 영속 저장소 부재로 프로세스 재시작 시 히스토리 손실.
4. 인증/인가가 없어 로컬 외 노출 시 보안 위험.

### 액션
1. HTTP 레이어 안정화: `axum` 또는 `hyper` 전환 검토.
2. 파일 감시를 이벤트 기반(`notify` + FSEvents)으로 전환.
3. SQLite 영속화 추가(`events`, `alerts`, `sources` 테이블).
4. `x-api-key` 검증 및 localhost 바인딩 기본값 강제.

### 수락 기준
- 비정상 입력 퍼징 테스트 통과.
- 재시작 후 최근 N건 복원 확인.
- 인증 없이 `POST /api/events` 거부 가능.

## 공통 우선순위 백로그
1. P0: 이벤트 기반 파일 감시 전환(준실시간 -> 실시간 근접)
2. P0: 릴리스 체크리스트 + 운영 runbook 문서화
3. P1: SSE incremental 업데이트 + 연결 상태 표시
4. P1: SQLite 영속화
5. P2: HTTP 레이어 프레임워크 전환

## 역할별 핸드오프
- lead -> backend: P0, P1 일정/우선순위 확정
- designer -> frontend: 상태 표현 규칙표 전달
- backend -> frontend: incremental API 계약 초안 전달
- frontend -> lead: 회귀 테스트 결과 리포트 전달
