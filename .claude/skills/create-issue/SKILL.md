---
name: create-issue
description: Create a GitHub issue following project conventions
argument-hint: "[이슈 제목]"
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
model: haiku
---

# Create Issue

## Current State

- **기존 라벨**: !`gh label list --limit 30 2>/dev/null || echo "라벨 목록을 가져올 수 없습니다"`

## Instructions

CLAUDE.md의 이슈 생성 규칙에 따라 GitHub 이슈를 생성한다.

### 1. 제목 결정
- `$ARGUMENTS`가 있으면 제목으로 사용
- 없으면 사용자에게 이슈 제목을 질문
- **검증**: 한국어, 동사형으로 시작, 70자 이내

### 2. 우선순위 선택
AskUserQuestion으로 우선순위를 선택받는다:
```json
{
  "questions": [{
    "question": "이슈의 우선순위를 선택해주세요.",
    "header": "우선순위",
    "options": [
      {"label": "priority: high", "description": "우선 처리 필요"},
      {"label": "priority: medium", "description": "일반 우선순위"},
      {"label": "priority: low", "description": "여유 있을 때 처리"}
    ],
    "multiSelect": false
  }]
}
```

### 3. 카테고리 선택
AskUserQuestion으로 카테고리를 선택받는다:
```json
{
  "questions": [{
    "question": "이슈의 카테고리를 선택해주세요.",
    "header": "카테고리",
    "options": [
      {"label": "enhancement", "description": "새 기능 또는 개선"},
      {"label": "bug", "description": "버그 수정"},
      {"label": "documentation", "description": "문서 작업"}
    ],
    "multiSelect": false
  }]
}
```

### 4. 본문 작성
사용자에게 배경과 작업 내용을 질문한 뒤, 아래 형식으로 본문을 구성한다:

```
## 배경
{사용자 입력 또는 컨텍스트 기반 작성}

## 작업 내용
- [ ] 할 일 1
- [ ] 할 일 2

## 관련 파일
- `path/to/file`

## 비고
{추가 사항}
```

### 5. 라벨 존재 확인
위에 주입된 기존 라벨 목록에서 사용할 라벨(`status: ready`, 선택된 우선순위, 선택된 카테고리)이 모두 존재하는지 확인한다.
- 존재하지 않는 라벨이 있으면 `gh label create "<라벨명>" --color "<색상>"`으로 생성한다
  - `status: ready` → `#0E8A16`
  - `priority: high` → `#D93F0B`, `priority: medium` → `#FBCA04`, `priority: low` → `#C5DEF5`
  - `enhancement` → `#A2EEEF`, `bug` → `#D73A4A`, `documentation` → `#0075CA`

### 6. 이슈 생성
```bash
gh issue create \
  --title "<제목>" \
  --label "status: ready,priority: <선택>,<카테고리>" \
  --body "<본문>"
```

### 7. 결과 출력
생성된 이슈 URL을 반환한다.
