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

커밋 규칙은 `.claude/skills/shared/commit-conventions.md`를 따른다.
해당 파일을 Read로 읽은 뒤 기준에 따라 커밋한다.

`$ARGUMENTS`가 제공되면 커밋 메시지 기반으로 사용한다.
