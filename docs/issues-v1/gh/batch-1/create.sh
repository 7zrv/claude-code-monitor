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
gh issue create --repo "$REPO" --title "docs: 제품명과 주요 UI 라벨 통일하기" --label "status: ready" --label "priority: high" --label "documentation" --body-file "$ROOT/v1-01-branding.md"
gh issue create --repo "$REPO" --title "feat: 세션 상태 모델과 위험도 규칙 정의하기" --label "status: ready" --label "priority: high" --label "enhancement" --body-file "$ROOT/v1-02-status-model.md"
gh issue create --repo "$REPO" --title "fix: 연결 끊김과 재연결 상태 UX 보강하기" --label "status: ready" --label "priority: high" --label "bug" --body-file "$ROOT/v1-07-connection-ux.md"
EOF
}

if [[ "${1:-}" != "--run" ]]; then
  echo "Preview mode. Review the commands below, then rerun with --run to create the issues."
  echo
  preview
  exit 0
fi

run "docs: 제품명과 주요 UI 라벨 통일하기" \
  "status: ready" \
  "priority: high" \
  "documentation" \
  "$ROOT/v1-01-branding.md"

run "feat: 세션 상태 모델과 위험도 규칙 정의하기" \
  "status: ready" \
  "priority: high" \
  "enhancement" \
  "$ROOT/v1-02-status-model.md"

run "fix: 연결 끊김과 재연결 상태 UX 보강하기" \
  "status: ready" \
  "priority: high" \
  "bug" \
  "$ROOT/v1-07-connection-ux.md"
