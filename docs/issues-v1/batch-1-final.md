# Claude Code Monitor v1 Batch 1 최종 등록본

- 작성일: 2026-03-08
- 목적: `Batch 1` 이슈 3개를 GitHub에 바로 등록할 수 있게 제목, 라벨, 본문을 압축 정리한다.

## V1-01

Title:
`docs: 제품명과 주요 UI 라벨 통일하기`

Labels:
`status: ready`, `priority: high`, `documentation`

Body:

```md
## 배경
현재 제품명이 `Claude Code Monitor`, `Claude Pulse`, `Codex Pulse`로 혼용되고 있다.
이 상태에서는 UI, README, 이슈 템플릿, 배포 문구의 일관성이 깨진다.

## 작업 내용
- [ ] 최종 제품명을 하나로 확정한다.
- [ ] `README.md`, `public/index.html`, Electron 실행명, 이슈 템플릿의 이름을 통일한다.
- [ ] 이슈 템플릿과 contact link에 남아 있는 이전 제품명을 정리한다.
- [ ] 헤더 부제와 README 한 줄 설명을 같은 방향으로 정리한다.
- [ ] 문서와 UI에 이전 이름이 남아 있지 않은지 점검한다.

## 관련 파일
- `README.md`
- `public/index.html`
- `desktop/main.js`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/improvement.md`
- `.github/ISSUE_TEMPLATE/config.yml`

## 비고
- 출시 전 정리해야 하는 항목이다.
```

## V1-02

Title:
`feat: 세션 상태 모델과 위험도 규칙 정의하기`

Labels:
`status: ready`, `priority: high`, `enhancement`

Body:

```md
## 배경
현재는 `ok`, `warning`, `error`와 최근 활동 시각을 섞어 상태를 해석하고 있다.
`Needs Attention`, 세션 정렬, 카드 지표를 일관되게 만들려면 세션 단위 상태 모델이 먼저 필요하다.

## 작업 내용
- [ ] 세션 상태 집합을 정의한다. 예: `active`, `idle`, `stuck`, `completed`, `failed`
- [ ] 상태별 판정 규칙과 우선순위를 문서화한다.
- [ ] 상태 계산 위치를 정한다. 프론트엔드, 백엔드, 또는 공통 계산 규칙
- [ ] workflow, sessions, alerts, cards가 같은 상태 모델을 쓰도록 기준을 맞춘다.
- [ ] 경계 사례를 정리한다.

## 관련 파일
- `docs/prd-v1.md`
- `docs/ia-v1.md`
- `public/lib/workflow.js`
- `public/app.js`
- `src/state.rs`
- `src/types.rs`

## 비고
- `V1-03`, `V1-04`, `V1-05`, `V1-11`의 선행 조건이다.
```

## V1-07

Title:
`fix: 연결 끊김과 재연결 상태 UX 보강하기`

Labels:
`status: ready`, `priority: high`, `bug`

Body:

```md
## 배경
모니터링 도구는 데이터가 비어 있는 이유를 사용자가 추측하게 만들면 안 된다.
현재는 연결 배지가 있지만, 수집 실패, UI 연결 실패, 단순 무이벤트를 충분히 구분하지 못한다.

## 작업 내용
- [ ] `connected`, `reconnecting`, `offline` 상태 정의를 명확히 한다.
- [ ] 마지막 성공 시각 또는 마지막 수신 시각을 표시한다.
- [ ] 연결 실패 시 안내 문구를 정리한다.
- [ ] 수집 실패와 UI 스트림 실패를 구분해 표현할 수 있는지 검토한다.
- [ ] 상태 변화 검증 절차를 정리한다.

## 관련 파일
- `public/lib/connection.js`
- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `src/http.rs`

## 비고
- 운영 신뢰성과 직결되는 항목이다.
```
