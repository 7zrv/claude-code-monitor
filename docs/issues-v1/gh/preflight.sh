#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="${GH_REPO:-7zrv/claude-code-monitor}"
BATCH="${1:-}"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") batch-1
  $(basename "$0") batch-2
  $(basename "$0") batch-3
  $(basename "$0") batch-4

Optional:
  GH_REPO=owner/repo $(basename "$0") batch-1
EOF
}

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

pass() {
  echo "[PASS] $1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

check_auth() {
  gh auth status >/dev/null 2>&1 || fail "gh auth status failed. Run: gh auth login"
  pass "GitHub CLI authentication is available"
}

check_repo() {
  gh repo view "$REPO" >/dev/null 2>&1 || fail "Cannot access repo: $REPO"
  pass "Target repo is accessible: $REPO"
}

batch_setup() {
  case "$BATCH" in
    batch-1)
      BATCH_DIR="$SCRIPT_DIR/batch-1"
      TITLES=(
        "docs: 제품명과 주요 UI 라벨 통일하기"
        "feat: 세션 상태 모델과 위험도 규칙 정의하기"
        "fix: 연결 끊김과 재연결 상태 UX 보강하기"
      )
      LABELS=("status: ready" "priority: high" "documentation" "enhancement" "bug")
      FILES=("create.sh" "v1-01-branding.md" "v1-02-status-model.md" "v1-07-connection-ux.md")
      ;;
    batch-2)
      BATCH_DIR="$SCRIPT_DIR/batch-2"
      TITLES=(
        "feat: 상단 요약 카드를 세션 중심 지표로 개편하기"
        "feat: Needs Attention 섹션으로 문제 세션 노출하기"
        "refactor: Sessions Workspace를 메인 진단 영역으로 재구성하기"
        "feat: alert에서 session detail로 바로 열기"
      )
      LABELS=("status: ready" "priority: high" "enhancement")
      FILES=("create.sh" "v1-03-summary-cards.md" "v1-04-needs-attention.md" "v1-05-sessions-workspace.md" "v1-06-alert-to-session.md")
      ;;
    batch-3)
      BATCH_DIR="$SCRIPT_DIR/batch-3"
      TITLES=(
        "feat: 첫 실행 빈 상태와 수집 경로 안내 추가하기"
        "feat: stuck 세션과 cost spike 규칙 탐지하기"
        "refactor: workflow와 그래프를 보조 분석 영역으로 정리하기"
        "feat: 세션 정렬과 필터를 위험도 중심으로 개선하기"
        "fix: 대량 이벤트 상황의 응답성 확보하기"
      )
      LABELS=("status: ready" "priority: medium" "priority: high" "enhancement" "bug")
      FILES=("create.sh" "v1-08-empty-state.md" "v1-09-risk-detection.md" "v1-10-analysis-layout.md" "v1-11-session-sorting.md" "v1-12-performance.md")
      ;;
    batch-4)
      BATCH_DIR="$SCRIPT_DIR/batch-4"
      TITLES=(
        "feat: 세션 내부 계층형 agent 트리 추가하기"
        "feat: 사용자 정의 alert 규칙 추가하기"
        "feat: 세션 데이터 export 추가하기"
      )
      LABELS=("status: ready" "priority: low" "enhancement")
      FILES=("create.sh" "v1-13-agent-tree.md" "v1-14-custom-alerts.md" "v1-15-export.md")
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

check_files() {
  [[ -d "$BATCH_DIR" ]] || fail "Batch directory not found: $BATCH_DIR"
  for file in "${FILES[@]}"; do
    [[ -f "$BATCH_DIR/$file" ]] || fail "Missing file: $BATCH_DIR/$file"
  done
  [[ -x "$BATCH_DIR/create.sh" ]] || fail "Batch script is not executable: $BATCH_DIR/create.sh"
  pass "Batch files are present"
}

check_labels() {
  local available
  available="$(gh api "repos/$REPO/labels?per_page=100" --paginate --jq '.[].name')"
  for label in "${LABELS[@]}"; do
    if ! grep -Fxq "$label" <<<"$available"; then
      fail "Missing label in repo: $label"
    fi
  done
  pass "Required labels exist in repo"
}

check_duplicates() {
  local found=0
  local title results exact
  for title in "${TITLES[@]}"; do
    results="$(gh api search/issues -f q="repo:$REPO is:issue in:title \"$title\"" --jq '.items[] | "\(.title)\t#\(.number)\t\(.state)\t\(.html_url)"' 2>/dev/null || true)"
    exact="$(printf '%s\n' "$results" | awk -F'\t' -v t="$title" '$1 == t')"
    if [[ -n "$exact" ]]; then
      echo "[WARN] Existing issue title found: $title"
      printf '%s\n' "$exact"
      found=1
    else
      echo "[PASS] No exact duplicate title found: $title"
    fi
  done

  [[ "$found" -eq 0 ]] || fail "Duplicate issue titles detected. Review before running create.sh --run"
}

echo "Preflight checks for $BATCH"
echo "Repo: $REPO"
echo

require_cmd gh
pass "GitHub CLI is installed"

batch_setup
check_files
check_auth
check_repo
check_labels
check_duplicates

echo
echo "All checks passed."
echo "Next step:"
echo "  $BATCH_DIR/create.sh --run"
