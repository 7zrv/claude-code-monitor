## 배경
현재 화면은 차트와 타임라인이 세션 진단 영역보다 앞에 있어 제품 초점을 흐린다.
v1에서는 분석 패널이 아니라 진단 패널이 먼저 보여야 한다.

## 작업 내용
- [ ] workflow, timeline, graphs, recent events의 새 배치 순서를 확정한다.
- [ ] 세션 작업 공간과 alerts가 상단 진단 흐름을 차지하도록 구조를 조정한다.
- [ ] 모바일에서 분석 영역의 우선순위를 더 낮추는 레이아웃을 검토한다.
- [ ] 섹션 제목과 설명이 역할에 맞게 읽히도록 문구를 정리한다.
- [ ] 새 배치가 사용성에 미치는 영향을 수동 점검한다.

## 관련 파일
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/lib/renders/timeline.js`
- `public/lib/renders/charts.js`
- `docs/ia-v1.md`

## 비고
- 기능 추가보다 정보 우선순위 정리가 핵심이다.
