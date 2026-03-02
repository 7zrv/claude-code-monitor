---
name: push
description: Push current branch to remote
disable-model-invocation: true
allowed-tools: Bash
model: haiku
---

# 리모트 푸시

## Current State

- **Branch**: !`git branch --show-current`
- **Remote tracking**: !`git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream"`
- **Unpushed commits**: !`git log @{u}..HEAD --oneline 2>/dev/null || git log --oneline -5`

## Instructions

1. 현재 브랜치가 `main` 또는 `master`이면 경고를 출력하고 중단한다
2. upstream이 설정되지 않았으면 `git push -u origin <branch>`를 사용한다
3. upstream이 있으면 `git push`를 사용한다
4. `--force` 푸시는 사용자가 명시적으로 요청하지 않는 한 절대 사용하지 않는다
5. 푸시 결과를 출력한다
