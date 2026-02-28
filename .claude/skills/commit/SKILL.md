---
name: commit
description: Stage and commit changes following conventional commits
argument-hint: "[optional commit message]"
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
model: haiku
---

# Commit Changes

## Current State

- **Status**: !`git status --short`
- **Staged diff stat**: !`git diff --cached --stat`
- **Unstaged diff stat**: !`git diff --stat`
- **Recent commits**: !`git log --oneline -5`

## Instructions

**⚠️ Main Branch Protection**
If on `main` branch, STOP and provide this error message:
```
❌ Cannot commit directly to 'main' branch

All changes to 'main' must go through a Pull Request:

1. Create a feature branch:
   git checkout -b <type>/<name>-<issue-number>
   Example: git checkout -b feat/parse-history-2

2. Make your changes on the feature branch

3. Push and create a PR:
   git push -u origin <branch-name>
   /pr

This protects main from direct commits per CONTRIBUTING.md rules.
```
DO NOT proceed with the commit. Return immediately.

---

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

7. Run `git status` after committing to verify success
