---
name: push
description: Push current branch to remote
disable-model-invocation: true
allowed-tools: Bash
model: haiku
---

# Push to Remote

## Current State

- **Branch**: !`git branch --show-current`
- **Remote tracking**: !`git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream"`
- **Unpushed commits**: !`git log @{u}..HEAD --oneline 2>/dev/null || git log --oneline -5`

## Instructions

1. Check if the current branch has an upstream. If not, use `git push -u origin <branch>`
2. If upstream exists, use `git push`
3. Never force push unless explicitly requested
4. Never push to `main` or `master` directly — warn the user
5. Show the result after pushing
