---
name: clean-worktrees
description: 머지 완료된 워크트리를 탐지하고 정리
disable-model-invocation: true
allowed-tools: Bash, AskUserQuestion
model: haiku
---

# 머지 완료 워크트리 정리

## Current State
- **워크트리 목록**:
!`git worktree list 2>/dev/null | grep -v "$(pwd)$" || echo "워크트리 없음"`
- **원격 브랜치**:
!`git fetch origin --prune 2>/dev/null && git branch -r --list 'origin/*' | head -20`

## Instructions

`.claude/worktrees/` 하위의 워크트리 중 머지 완료된 항목을 탐지하고 정리한다.

### 1. 워크트리 목록 수집

`git worktree list --porcelain`로 모든 워크트리 정보를 파싱한다.
- 메인 워크트리(현재 프로젝트 루트)는 제외한다
- 각 워크트리의 경로(worktree), 브랜치(branch) 정보를 추출한다
- 워크트리가 없으면 "정리할 워크트리가 없습니다."를 출력하고 종료한다

### 2. 머지 상태 판별

각 워크트리 브랜치에 대해 아래 순서로 머지 여부를 판별한다:

1. `gh pr list --head <branch> --state merged --json number,title --jq '.[0]'`로 머지된 PR 확인
2. PR이 없으면 `git branch -r --list 'origin/<branch>'`로 원격 브랜치 존재 여부 확인
   - 원격 브랜치가 삭제되었으면 "정리 대상"으로 분류

분류 결과:
- **정리 대상**: 머지된 PR이 있거나, 원격 브랜치가 삭제된 워크트리
- **활성**: 아직 머지되지 않았고 원격 브랜치가 존재하는 워크트리

### 3. 결과 표시

아래 형식으로 테이블을 출력한다:

```
📋 워크트리 상태

🗑️ 정리 대상 (N개):
  브랜치                          경로                                    사유
  feat/some-feature-12            .claude/worktrees/feat/some-feature-12  PR #12 머지됨
  fix/bug-fix-15                  .claude/worktrees/fix/bug-fix-15        원격 브랜치 삭제됨

✅ 활성 워크트리 (M개):
  브랜치                          경로
  feat/active-work-20             .claude/worktrees/feat/active-work-20
```

정리 대상이 없으면 "정리할 워크트리가 없습니다. 모든 워크트리가 활성 상태입니다."를 출력하고 종료한다.

### 4. 사용자 확인

AskUserQuestion으로 정리 범위를 선택받는다:

- **전체 정리**: 정리 대상 워크트리를 모두 제거
- **선택 정리**: 정리 대상 중 제거할 항목을 개별 선택
- **취소**: 정리하지 않고 종료

"선택 정리"를 선택한 경우, 추가 AskUserQuestion(multiSelect)으로 제거할 워크트리를 선택받는다.

### 5. 정리 실행

선택된 각 워크트리에 대해 순서대로 실행한다:

```bash
git worktree remove <워크트리 경로> --force
git branch -d <브랜치명>
```

- `git branch -d`가 실패하면(머지되지 않은 브랜치) 사용자에게 알리고, 강제 삭제(`-D`) 여부를 확인한다
- 각 워크트리 제거 결과(성공/실패)를 기록한다

### 6. 결과 출력

```
🧹 워크트리 정리 완료
- 정리됨: N개
- 남은 워크트리: M개
- 확보된 공간: (정리된 워크트리 경로 목록)
```

최종 상태를 `git worktree list`로 확인하여 출력한다.
