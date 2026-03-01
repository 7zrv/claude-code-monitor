---
name: ship
description: Stage, commit, push, and create a PR in one step
argument-hint: "[optional commit message]"
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
model: sonnet
---

# Ship Changes (Commit + Push + PR)

## Current State

- **Branch**: !`git branch --show-current`
- **Status**: !`git status --short`
- **Staged diff stat**: !`git diff --cached --stat`
- **Unstaged diff stat**: !`git diff --stat`
- **Recent commits**: !`git log --oneline -5`
- **Commits vs main**: !`git log main..HEAD --oneline`
- **Diff vs main stat**: !`git diff main..HEAD --stat`
- **Remote tracking**: !`git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream"`

## Instructions

### 1. Main Branch 보호 확인

현재 브랜치가 `main`이면 즉시 중단하고 아래 메시지를 출력한다:
```
❌ Cannot ship directly from 'main' branch

All changes to 'main' must go through a Pull Request:

1. Create a feature branch:
   git checkout -b <type>/<name>-<issue-number>
   Example: git checkout -b feat/parse-history-2

2. Make your changes on the feature branch

3. Run /ship again from the feature branch

This protects main from direct commits per CONTRIBUTING.md rules.
```
DO NOT proceed. Return immediately.

---

### 2. Stage + Commit

1. Review the diff stats above. If needed, run `git diff` or `git diff --cached` for full details on specific files.
2. Stage relevant files by name (`git add <file>...`) — never use `git add -A` or `git add .`
3. Do not commit files that may contain secrets (.env, credentials, etc.)
4. Write a commit message following **Conventional Commits**:

```
<type>(<scope>): <한국어 설명>
```

- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
- **Scopes** (optional): `api`, `sse`, `ui`, `desktop`, `collector`, `docs`
- **description은 반드시 한국어로 작성한다** (type, scope은 영어 유지)
- Subject line: max 70 chars, no period
- If `$ARGUMENTS` is provided, use it as the commit message basis
- 예시: `feat(api): 세션 파싱 기능 추가`, `fix(ui): 대시보드 렌더링 오류 수정`

5. Always append the co-author trailer:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

6. Use a HEREDOC to pass the commit message:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <한국어 설명>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

7. Run `git status` after committing to verify success.

### 3. Push

1. Check if the current branch has an upstream. If not, use `git push -u origin <branch>`
2. If upstream exists, use `git push`
3. Never force push unless explicitly requested
4. Show the result after pushing

### 4. Rebase + PR 생성

1. 브랜치 최신화
   - `git fetch origin main`으로 최신 main을 가져온다
   - `git rebase origin/main`으로 현재 브랜치를 최신화한다
   - 충돌이 발생하면 `git rebase --abort`로 롤백하고, 사용자에게 충돌 파일 목록을 안내한 뒤 중단한다
   - rebase 후 변경이 있으면 `git push --force-with-lease`로 푸시한다
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

4. 관련 이슈 번호 결정:
   - `$ARGUMENTS`에 이슈 번호가 있으면 해당 값을 사용
   - 없으면 브랜치명 끝의 숫자를 이슈 번호로 추출 (예: `feat/add-cache-18` → `18`)
   - `Closes #<이슈번호>`를 PR 본문에 포함
5. Keep the PR title under 70 characters and follow conventional commit style
6. Return the PR URL when done

### 5. 결과 출력

```
✅ Ship 완료
- 커밋: <commit hash> <commit message>
- 브랜치: <branch> → origin/<branch>
- PR: <PR URL>
```
