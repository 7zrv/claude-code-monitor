---
name: start-issue
description: Pick a ready issue, create a branch, and update issue status
disable-model-invocation: true
allowed-tools: Bash, Read, AskUserQuestion
model: sonnet
---

# 이슈 작업 시작

## Current State
- **Ready issues**:
!`gh issue list --label "status: ready" --state open --limit 20 2>/dev/null || echo "이슈 목록을 가져올 수 없습니다"`
- **Current branch**: !`git branch --show-current`

## Instructions

`status: ready` 상태의 이슈를 선택하여 작업 브랜치를 생성하고, 이슈 상태를 변경한다.

### 1. 이슈 선택
- 위에 주입된 Ready Issues 목록을 사용자에게 제시한다
- AskUserQuestion으로 작업할 이슈를 선택받는다
- 목록이 비어 있으면 "현재 `status: ready` 상태의 이슈가 없습니다."를 출력하고 종료한다

### 2. 브랜치 prefix 결정
선택된 이슈의 라벨을 확인하여 브랜치 prefix를 결정한다:

| 카테고리 라벨 | 브랜치 prefix |
|--------------|--------------|
| `enhancement` | `feat/` |
| `bug` | `fix/` |
| `documentation` | `docs/` |
| 리팩토링 | `refactor/` |
| 기타 | `chore/` |

- 카테고리가 `enhancement`, `bug`, `documentation`에 해당하지 않는 경우, AskUserQuestion으로 `refactor/` 또는 `chore/` 중 적절한 prefix를 사용자에게 선택받는다

### 3. 브랜치명 생성
- 이슈 제목을 영문 kebab-case로 변환한다
- 이슈 번호를 suffix로 포함하여 추적성을 확보한다
- 예: "CI 워크플로우에 캐싱 추가하기" (이슈 #18) → `feat/ci-caching-18`
- **필수**: AskUserQuestion으로 생성된 브랜치명을 제시하고 수정 기회를 제공한다

### 4. 브랜치 생성 및 checkout
```bash
git checkout main && git pull
git checkout -b <브랜치명>
```

### 5. 이슈 상태 변경
```bash
gh issue edit <이슈번호> --remove-label "status: ready" --add-label "status: in-progress"
```

### 6. 결과 출력
```
✅ 작업 준비 완료
- 이슈: #<번호> <제목>
- 브랜치: <브랜치명>
- 상태: status: ready → status: in-progress
```
