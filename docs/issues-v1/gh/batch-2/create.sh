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
gh issue create --repo "$REPO" --title "feat: 상단 요약 카드를 세션 중심 지표로 개편하기" --label "status: ready" --label "priority: high" --label "enhancement" --body-file "$ROOT/v1-03-summary-cards.md"
gh issue create --repo "$REPO" --title "feat: Needs Attention 섹션으로 문제 세션 노출하기" --label "status: ready" --label "priority: high" --label "enhancement" --body-file "$ROOT/v1-04-needs-attention.md"
gh issue create --repo "$REPO" --title "refactor: Sessions Workspace를 메인 진단 영역으로 재구성하기" --label "status: ready" --label "priority: high" --label "enhancement" --body-file "$ROOT/v1-05-sessions-workspace.md"
gh issue create --repo "$REPO" --title "feat: alert에서 session detail로 바로 열기" --label "status: ready" --label "priority: high" --label "enhancement" --body-file "$ROOT/v1-06-alert-to-session.md"
EOF
}

if [[ "${1:-}" != "--run" ]]; then
  echo "Preview mode. Review the commands below, then rerun with --run to create the issues."
  echo
  preview
  exit 0
fi

run "feat: 상단 요약 카드를 세션 중심 지표로 개편하기" \
  "status: ready" \
  "priority: high" \
  "enhancement" \
  "$ROOT/v1-03-summary-cards.md"

run "feat: Needs Attention 섹션으로 문제 세션 노출하기" \
  "status: ready" \
  "priority: high" \
  "enhancement" \
  "$ROOT/v1-04-needs-attention.md"

run "refactor: Sessions Workspace를 메인 진단 영역으로 재구성하기" \
  "status: ready" \
  "priority: high" \
  "enhancement" \
  "$ROOT/v1-05-sessions-workspace.md"

run "feat: alert에서 session detail로 바로 열기" \
  "status: ready" \
  "priority: high" \
  "enhancement" \
  "$ROOT/v1-06-alert-to-session.md"
