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

PR 생성 규칙은 `.claude/skills/shared/pr-template.md`를 따른다.
해당 파일을 Read로 읽은 뒤 기준에 따라 PR을 생성한다.

추가 사항:
- `$ARGUMENTS`가 있으면 관련 이슈 번호로 사용한다
- `main` 대비 모든 커밋을 분석하여 PR 내용을 작성한다 — 최신 커밋만이 아닌 전체 커밋을 대상으로 한다
