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
- **Staged diff**: !`git diff --cached`
- **Unstaged diff**: !`git diff`
- **Recent commits**: !`git log --oneline -5`

## Instructions

1. Review all changed files above
2. Stage relevant files by name (`git add <file>...`) — never use `git add -A` or `git add .`
3. Do not commit files that may contain secrets (.env, credentials, etc.)
4. Write a commit message following **Conventional Commits**:

```
<type>(<scope>): <description>
```

- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
- **Scopes** (optional): `api`, `sse`, `ui`, `desktop`, `collector`, `docs`
- Subject line: lowercase, max 70 chars, no period
- If `$ARGUMENTS` is provided, use it as the commit message basis

5. Always append the co-author trailer:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

6. Use a HEREDOC to pass the commit message:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <description>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

7. Run `git status` after committing to verify success
