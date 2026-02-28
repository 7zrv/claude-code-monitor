---
name: review-code
description: Review code changes on the current branch vs main
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
model: sonnet
---

# 현재 브랜치 코드 리뷰

## Current State
- **Branch**: !`git branch --show-current`
- **Commits vs main**: !`git log main..HEAD --oneline`
- **Diff stat**: !`git diff main..HEAD --stat`

## Instructions

현재 브랜치의 변경 사항(main 대비)을 분석하여 코드 리뷰를 수행한다.

> **주의**: Full diff는 위에 주입되지 않는다. 아래 단계에서 직접 실행한다.

### 1. 변경 사항 수집
- 위 Diff stat으로 변경된 파일 목록을 파악한다
- Bash로 `git diff main..HEAD` 실행하여 상세 diff를 수집한다
- 각 변경 파일을 Read로 읽어 전체 컨텍스트를 파악한다

### 2. 리뷰 수행
리뷰 기준은 `.claude/skills/shared/review-criteria.md`를 따른다.
해당 파일을 Read로 읽은 뒤 기준에 따라 리뷰를 수행한다.
해당 파일이 존재하지 않을 경우, 다음 기준을 사용한다: 코드 품질, 버그 가능성, 보안 이슈, 컨벤션 준수, 테스트

### 3. 결과 출력

출력 형식은 `.claude/skills/shared/review-criteria.md`의 출력 형식을 따른다.

예시:
```
## 코드 리뷰 결과

### 요약
- 변경 파일: 3개
- 이슈: 🔴 0 / 🟡 2 / 🔵 1

### 상세

#### 🟡 `src/main.rs:42` — 에러 처리 누락
현재 unwrap()을 사용하고 있어 패닉 가능성이 있습니다.
> 제안: `?` 연산자로 교체
```

- 이슈가 없으면 "리뷰 결과 이슈가 발견되지 않았습니다."로 마무리한다
