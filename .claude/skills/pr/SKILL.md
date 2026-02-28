---
name: pr
description: Create a pull request on GitHub
argument-hint: "[optional issue number]"
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
model: sonnet
---

# Create Pull Request

## Current State

- **Branch**: !`git branch --show-current`
- **Commits vs main**: !`git log main..HEAD --oneline`
- **Diff vs main**: !`git diff main..HEAD --stat`
- **Remote status**: !`git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream"`

## Instructions

1. 브랜치 최신화
   - `git fetch origin main`으로 최신 main을 가져온다
   - `git rebase origin/main`으로 현재 브랜치를 최신화한다
   - 충돌이 발생하면 `git rebase --abort`로 롤백하고, 사용자에게 충돌 파일 목록을 안내한 뒤 중단한다
2. Ensure the branch is pushed to remote. If not, push with `git push -u origin <branch>`
3. Analyze all commits from `main` to `HEAD` — not just the latest commit
4. Create a PR using `gh pr create` with the following format:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points summarizing the changes>

## Changes
<list of key changes>

## Related Issue
Closes #<issue-number>

## Test Plan
- [ ] `cargo fmt --check` pass
- [ ] `cargo clippy -- -D warnings` pass
- [ ] `cargo test` pass
- [ ] `npm run check` pass
- [ ] Manual verification of related functionality

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

5. 관련 이슈 번호 결정:
   - `$ARGUMENTS`가 있으면 해당 값을 사용
   - 없으면 브랜치명 끝의 숫자를 이슈 번호로 추출 (예: `feat/add-cache-18` → `18`)
   - `Closes #<이슈번호>`를 PR 본문에 포함
6. Keep the PR title under 70 characters and follow conventional commit style
7. Return the PR URL when done
