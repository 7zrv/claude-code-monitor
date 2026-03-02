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

커밋 규칙은 `.claude/skills/shared/commit-conventions.md`를 따른다.
해당 파일을 Read로 읽은 뒤 기준에 따라 커밋한다.

`$ARGUMENTS`가 제공되면 커밋 메시지 기반으로 사용한다.

### 3. Rebase + Push

PR 생성 규칙은 `.claude/skills/shared/pr-template.md`를 따른다.
해당 파일을 Read로 읽은 뒤, **1. 브랜치 최신화** 및 **2. 리모트 푸시** 단계를 수행한다.

### 4. PR 생성

`.claude/skills/shared/pr-template.md`의 **3~6** 단계를 따라 PR을 생성한다.

추가 사항:
- `$ARGUMENTS`에 이슈 번호가 있으면 해당 값을 사용한다
- `main` 대비 모든 커밋을 분석하여 PR 내용을 작성한다

### 5. 결과 출력

```
✅ Ship 완료
- 커밋: <commit hash> <commit message>
- 브랜치: <branch> → origin/<branch>
- PR: <PR URL>
```
