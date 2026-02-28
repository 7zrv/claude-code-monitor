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

1. Ensure the branch is pushed to remote. If not, push with `git push -u origin <branch>`
2. Analyze all commits from `main` to `HEAD` — not just the latest commit
3. Create a PR using `gh pr create` with the following format:

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

4. If `$ARGUMENTS` is provided, use it as the related issue number in `Closes #$ARGUMENTS`
5. Keep the PR title under 70 characters and follow conventional commit style
6. Return the PR URL when done
