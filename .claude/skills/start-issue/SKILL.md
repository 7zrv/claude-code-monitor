---
name: start-issue
description: Pick a ready issue, create a branch, and update issue status
disable-model-invocation: true
allowed-tools: Bash, Read, AskUserQuestion, EnterWorktree
model: haiku
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
- 목록이 비어 있으면 "현재 `status: ready` 상태의 이슈가 없습니다."를 출력하고 종료한다
- AskUserQuestion으로 작업할 이슈를 선택받는다. 파라미터 구조:
  ```json
  {
    "questions": [{
      "question": "어떤 이슈를 작업하시겠습니까?",
      "header": "이슈 선택",
      "options": [
        {"label": "#번호 이슈제목", "description": "라벨 정보"}
      ],
      "multiSelect": false
    }]
  }
  ```
  - Ready Issues 목록의 각 이슈를 options 배열에 매핑한다
  - label에는 `#번호 이슈제목` 형식을, description에는 라벨 정보를 넣는다
  - 응답에서 선택된 label의 이슈 번호를 파싱하여 사용한다

### 2. 브랜치 prefix 결정
선택된 이슈의 라벨을 확인하여 브랜치 prefix를 결정한다:

| 카테고리 라벨 | 브랜치 prefix |
|--------------|--------------|
| `enhancement` | `feat/` |
| `bug` | `fix/` |
| `documentation` | `docs/` |
| 리팩토링 | `refactor/` |
| 기타 | `chore/` |

- 카테고리가 `enhancement`, `bug`, `documentation`에 해당하지 않는 경우, AskUserQuestion으로 prefix를 선택받는다:
  ```json
  {
    "questions": [{
      "question": "브랜치 prefix를 선택해주세요.",
      "header": "Prefix",
      "options": [
        {"label": "refactor/", "description": "코드 리팩토링 작업"},
        {"label": "chore/", "description": "기타 유지보수 작업"}
      ],
      "multiSelect": false
    }]
  }
  ```

### 3. 브랜치명 생성
- 이슈 제목을 영문 kebab-case로 변환한다
- 이슈 번호를 suffix로 포함하여 추적성을 확보한다
- 예: "CI 워크플로우에 캐싱 추가하기" (이슈 #18) → `feat/ci-caching-18`
- **필수**: AskUserQuestion으로 생성된 브랜치명을 제시하고 수정 기회를 제공한다:
  ```json
  {
    "questions": [{
      "question": "브랜치명을 확인해주세요: <생성된 브랜치명>",
      "header": "브랜치명",
      "options": [
        {"label": "확인", "description": "이 브랜치명을 그대로 사용"},
        {"label": "수정", "description": "다른 브랜치명을 직접 입력"}
      ],
      "multiSelect": false
    }]
  }
  ```
  - "수정" 또는 "Other"를 선택한 경우 사용자가 입력한 텍스트를 브랜치명으로 사용한다

### 4. 워크트리 생성 및 이동
1. main 브랜치를 최신 상태로 갱신한다:
   ```bash
   git checkout main && git pull
   ```
2. `EnterWorktree` 도구를 사용하여 워크트리를 생성하고 세션을 전환한다:
   - `name` 파라미터에 브랜치명을 지정한다
   - 이 도구는 `.claude/worktrees/<브랜치명>` 디렉토리를 생성하고, 세션의 작업 디렉토리를 자동으로 워크트리로 전환한다
- 동일 브랜치명의 워크트리가 이미 존재하면 AskUserQuestion으로 선택받는다:
  ```json
  {
    "questions": [{
      "question": "워크트리 '<브랜치명>'이 이미 존재합니다. 어떻게 하시겠습니까?",
      "header": "워크트리",
      "options": [
        {"label": "재사용", "description": "기존 워크트리를 그대로 사용"},
        {"label": "재생성", "description": "기존 워크트리를 삭제하고 새로 생성"}
      ],
      "multiSelect": false
    }]
  }
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
- 워크트리: .claude/worktrees/<브랜치명>
- 상태: status: ready → status: in-progress
```
