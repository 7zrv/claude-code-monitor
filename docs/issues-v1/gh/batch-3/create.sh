#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="${GH_REPO:-7zrv/claude-code-monitor}"

run() {
  gh issue create \
    --repo "$REPO" \
    --title "$1" \
    --label "$2" \
    --label "$3" \
    --label "$4" \
    --body-file "$5"
}

preview() {
  cat <<EOF
gh issue create --repo "$REPO" --title "feat: 첫 실행 빈 상태와 수집 경로 안내 추가하기" --label "status: ready" --label "priority: medium" --label "enhancement" --body-file "$ROOT/v1-08-empty-state.md"
gh issue create --repo "$REPO" --title "feat: stuck 세션과 cost spike 규칙 탐지하기" --label "status: ready" --label "priority: medium" --label "enhancement" --body-file "$ROOT/v1-09-risk-detection.md"
gh issue create --repo "$REPO" --title "refactor: workflow와 그래프를 보조 분석 영역으로 정리하기" --label "status: ready" --label "priority: medium" --label "enhancement" --body-file "$ROOT/v1-10-analysis-layout.md"
gh issue create --repo "$REPO" --title "feat: 세션 정렬과 필터를 위험도 중심으로 개선하기" --label "status: ready" --label "priority: medium" --label "enhancement" --body-file "$ROOT/v1-11-session-sorting.md"
gh issue create --repo "$REPO" --title "fix: 대량 이벤트 상황의 응답성 확보하기" --label "status: ready" --label "priority: high" --label "bug" --body-file "$ROOT/v1-12-performance.md"
EOF
}

if [[ "${1:-}" != "--run" ]]; then
  echo "Preview mode. Review the commands below, then rerun with --run to create the issues."
  echo
  preview
  exit 0
fi

run "feat: 첫 실행 빈 상태와 수집 경로 안내 추가하기" \
  "status: ready" \
  "priority: medium" \
  "enhancement" \
  "$ROOT/v1-08-empty-state.md"

run "feat: stuck 세션과 cost spike 규칙 탐지하기" \
  "status: ready" \
  "priority: medium" \
  "enhancement" \
  "$ROOT/v1-09-risk-detection.md"

run "refactor: workflow와 그래프를 보조 분석 영역으로 정리하기" \
  "status: ready" \
  "priority: medium" \
  "enhancement" \
  "$ROOT/v1-10-analysis-layout.md"

run "feat: 세션 정렬과 필터를 위험도 중심으로 개선하기" \
  "status: ready" \
  "priority: medium" \
  "enhancement" \
  "$ROOT/v1-11-session-sorting.md"

run "fix: 대량 이벤트 상황의 응답성 확보하기" \
  "status: ready" \
  "priority: high" \
  "bug" \
  "$ROOT/v1-12-performance.md"
