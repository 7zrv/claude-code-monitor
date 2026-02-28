---
name: review-pr
description: Review a pull request and provide feedback
argument-hint: "[PR 번호]"
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
model: sonnet
---

# PR 리뷰

## Current State
- **PR details**: !`gh pr view $ARGUMENTS 2>/dev/null || echo "PR 번호를 입력해주세요"`
- **PR diff stat**: !`gh pr diff $ARGUMENTS --stat 2>/dev/null || echo "PR 번호를 입력해주세요"`

## Instructions

PR 번호를 입력받아 변경 사항을 분석하고 리뷰 결과를 제공한다.

### 1. PR 정보 수집
- `$ARGUMENTS`가 비어 있으면 사용자에게 PR 번호를 질문한다
- 위에 주입된 PR details와 diff stat으로 개요를 파악한다
- Bash로 `gh pr diff <PR번호>` 실행하여 상세 diff를 수집한다 (동적 주입 X — 토큰 절약)
- Bash로 `gh pr view <PR번호> --comments`를 실행하여 기존 코멘트도 확인한다

### 2. 리뷰 수행
리뷰 기준은 `.claude/skills/shared/review-criteria.md`를 따른다.
해당 파일을 Read로 읽은 뒤 공통 기준에 따라 리뷰를 수행한다.

해당 파일이 존재하지 않을 경우, 아래 인라인 기준을 사용한다:
- **코드 품질**: 가독성, 중복 제거, 네이밍, 함수/모듈 분리
- **버그 가능성**: 엣지 케이스, off-by-one, null/undefined 처리
- **보안 이슈**: 인젝션, 하드코딩된 시크릿, 권한 검증 누락
- **컨벤션 준수**: 프로젝트 코딩 스타일, lint 규칙, 포맷팅
- **테스트**: 변경 사항에 대한 테스트 존재 여부 및 커버리지

추가로 PR 전용 기준을 적용한다:
- **PR 설명-코드 일치**: PR 본문의 설명이 실제 변경 내용과 일치하는지 확인
- **PR 템플릿 체크리스트**: PR 템플릿의 체크리스트 항목이 충족되었는지 확인
- **커밋 메시지 컨벤션**: Conventional Commits 규칙 준수 여부 확인

### 3. 결과 출력

아래 형식으로 출력한다:

```
## PR 리뷰 결과

### PR 개요
- 제목: {PR 제목}
- 변경 파일: N개
- 커밋: N개

### 요약
- 코드 이슈: 🔴 0 / 🟡 0 / 🔵 0
- PR 설명-코드 일치: ✅ / ❌
- 템플릿 체크리스트: ✅ / ❌
- 커밋 컨벤션: ✅ / ❌

### 상세

#### 🟡 `src/main.rs:42` — 에러 처리 누락
...
```

### 4. PR 코멘트 게시 (선택)
- AskUserQuestion으로 리뷰 결과를 PR 코멘트로 게시할지 질문한다
- 승인 시 `gh pr review <PR번호> --comment --body "<리뷰 결과>"`로 게시한다
- 거부 시 터미널 출력만으로 종료한다
