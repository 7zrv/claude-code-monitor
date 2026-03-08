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
gh issue create --repo "$REPO" --title "feat: 세션 내부 계층형 agent 트리 추가하기" --label "status: ready" --label "priority: low" --label "enhancement" --body-file "$ROOT/v1-13-agent-tree.md"
gh issue create --repo "$REPO" --title "feat: 사용자 정의 alert 규칙 추가하기" --label "status: ready" --label "priority: low" --label "enhancement" --body-file "$ROOT/v1-14-custom-alerts.md"
gh issue create --repo "$REPO" --title "feat: 세션 데이터 export 추가하기" --label "status: ready" --label "priority: low" --label "enhancement" --body-file "$ROOT/v1-15-export.md"
EOF
}

if [[ "${1:-}" != "--run" ]]; then
  echo "Preview mode. Review the commands below, then rerun with --run to create the issues."
  echo
  preview
  exit 0
fi

run "feat: 세션 내부 계층형 agent 트리 추가하기" \
  "status: ready" \
  "priority: low" \
  "enhancement" \
  "$ROOT/v1-13-agent-tree.md"

run "feat: 사용자 정의 alert 규칙 추가하기" \
  "status: ready" \
  "priority: low" \
  "enhancement" \
  "$ROOT/v1-14-custom-alerts.md"

run "feat: 세션 데이터 export 추가하기" \
  "status: ready" \
  "priority: low" \
  "enhancement" \
  "$ROOT/v1-15-export.md"
