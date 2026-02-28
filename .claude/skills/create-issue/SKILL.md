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
- `priority: high` — 우선 처리 필요
- `priority: medium` — 일반 우선순위
- `priority: low` — 여유 있을 때 처리

### 3. 카테고리 선택
AskUserQuestion으로 카테고리를 선택받는다:
- `enhancement` — 새 기능 또는 개선
- `bug` — 버그 수정
- `documentation` — 문서 작업

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

### 5. 이슈 생성
```bash
gh issue create \
  --title "<제목>" \
  --label "status: ready,priority: <선택>,<카테고리>" \
  --body "<본문>"
```

### 6. 결과 출력
생성된 이슈 URL을 반환한다.
