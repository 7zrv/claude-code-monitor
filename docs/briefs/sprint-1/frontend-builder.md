# Frontend Builder Brief

- Agent: `Frontend Builder`
- Model: `claude-sonnet-4.6`
- Sprint: `Sprint 1`

## 맡은 이슈

- 보조: `#117 docs: 제품명과 주요 UI 라벨 통일하기`
- 보조: `#119 fix: 연결 끊김과 재연결 상태 UX 보강하기`

## 목표

- 브랜드 혼선을 없애고, 연결 상태 문구가 사용자에게 명확하게 읽히게 한다.
- Sprint 2로 넘어가기 전에 UI 텍스트와 상태 표시의 기준을 정리한다.

## 입력

- `/Users/yunseojin/claude-code-monitor/public/index.html`
- `/Users/yunseojin/claude-code-monitor/public/app.js`
- `/Users/yunseojin/claude-code-monitor/public/styles.css`
- `/Users/yunseojin/claude-code-monitor/public/lib/connection.js`
- `/Users/yunseojin/claude-code-monitor/README.md`

## 해야 할 일

1. 현재 UI에 남아 있는 브랜드 이름을 전부 찾는다.
2. 연결 상태 배지와 마지막 갱신 시각의 표현을 점검한다.
3. `connected`, `reconnecting`, `offline`의 사용자 문구 후보를 만든다.
4. 빈 상태와 연결 실패 상태가 혼동될 가능성을 적는다.
5. `#117`과 `#119`를 함께 반영할 때의 UI 영향도를 정리한다.

## 산출물

- UI 텍스트 변경 목록
- 연결 상태 UX 메모
- 화면 영향도 목록

## 완료조건

- 제품명과 연결 상태 문구가 같은 기준으로 정리된다.
- QA Ops가 바로 수동 검증할 수 있는 화면 체크포인트가 나온다.
- Sprint 2 UI 작업과 충돌할 가능성이 큰 지점이 표시된다.

## 핸드오프

- To: `QA Ops`, `Lead PM`
- 전달물:
  - 변경 대상 화면 목록
  - 상태별 문구 후보
  - 시각적 위험 포인트

## 작업 종료 템플릿

```md
## Summary
- 바꿔야 할 화면/문구

## Decisions
- 브랜드 문구
- 상태 문구

## Risks
- 빈 상태와 연결 실패 혼동 가능성

## Tests
- 확인할 UI 체크포인트

## Next
- QA가 검증할 항목
```
