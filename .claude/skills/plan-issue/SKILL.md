---
name: plan-issue
description: Read issue details, analyze related code, and document a work plan
argument-hint: "[이슈 번호]"
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
model: sonnet
---

# 이슈 작업 계획 수립

## Current State
- **Current branch**: !`git branch --show-current`
- **Issue number from branch**: !`git branch --show-current | grep -oE '[0-9]+$'`

## Instructions

이슈 내용을 확인하고, 관련 코드를 분석하여 작업 계획을 `PLAN.md`로 문서화한다.

### 1. 이슈 번호 결정
- `$ARGUMENTS`가 있으면 이슈 번호로 사용한다
- 없으면 위에 주입된 브랜치명 끝의 숫자를 이슈 번호로 사용한다
- 둘 다 없으면 AskUserQuestion으로 이슈 번호를 입력받는다

### 2. 이슈 상세 확인
```bash
gh issue view <이슈번호>
```
- 이슈 제목, 본문, 라벨, 작업 내용 체크리스트를 파악한다

### 3. 관련 코드 분석
- 이슈 본문의 **관련 파일** 섹션에 명시된 파일을 Read로 읽는다
- 관련 파일이 명시되지 않은 경우, 이슈 제목과 본문의 키워드로 Grep/Glob을 사용하여 관련 파일을 탐색한다
- 변경이 필요한 코드 영역을 식별한다

### 4. 작업 계획 작성
현재 디렉토리에 `PLAN.md` 파일을 생성한다. 형식:

```markdown
# Issue #<번호>: <제목>

## 이슈 요약
<!-- 이슈의 핵심 목표를 1-2문장으로 요약 -->

## 현재 상태 분석
<!-- 관련 코드의 현재 구조와 동작 방식 -->
- `파일경로:라인` — 현재 동작 설명

## 변경 계획
<!-- 구체적인 변경 사항을 파일별로 정리 -->

### 1. `파일경로`
- [ ] 변경할 내용 설명
- [ ] 변경할 내용 설명

### 2. `파일경로`
- [ ] 변경할 내용 설명

## 검증 방법
<!-- 변경 후 확인할 사항 -->
- [ ] `cargo build` / `cargo test` 통과
- [ ] 기능별 검증 항목

## 의존성 및 주의사항
<!-- 다른 이슈와의 연관, 주의할 점 -->
```

### 주의사항
- `PLAN.md`는 작업 참고용이며 커밋에 포함하지 않는다. 작업 완료 후 삭제하거나 `.gitignore`에 의해 무시된다.

### 5. 사용자 확인
- 작성된 `PLAN.md`의 핵심 내용을 터미널에 요약 출력한다
- AskUserQuestion으로 계획에 대한 피드백을 받는다
  - **승인**: 그대로 진행
  - **수정 요청**: 피드백을 반영하여 `PLAN.md`를 수정한다

### 6. 결과 출력
```
✅ 작업 계획 수립 완료
- 이슈: #<번호> <제목>
- 계획 파일: PLAN.md
- 변경 대상: N개 파일
```
