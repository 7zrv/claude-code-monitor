# docs: 제품명과 주요 UI 라벨 통일하기

- Backlog ID: `V1-01`
- Labels: `status: ready`, `priority: high`, `documentation`

## 배경

현재 저장소와 README는 `Claude Code Monitor`를 사용하지만, UI 제목과 일부 템플릿은 `Claude Pulse`, `Codex Pulse`를 혼용하고 있다.
이 상태에서는 제품 정체성이 흔들리고, 스크린샷·문서·배포 설명·이슈 제목까지 일관성을 잃는다.

## 작업 내용
- [ ] 최종 제품명을 하나로 확정한다.
- [ ] `README.md`, `public/index.html`, Electron 실행명, 이슈 템플릿의 제품명을 통일한다.
- [ ] 이슈 템플릿과 contact link에 남아 있는 이전 제품명을 정리한다.
- [ ] 헤더 부제와 README 한 줄 설명을 같은 방향으로 맞춘다.
- [ ] 문서와 UI에서 더 이상 이전 이름이 남아 있지 않은지 점검한다.
- [ ] 변경된 이름을 기준으로 이후 문서 작성 원칙을 정리한다.

## 관련 파일
- `README.md`
- `public/index.html`
- `desktop/main.js`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/improvement.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `docs/prd-v1.md`

## 비고

- 출시 전 반드시 정리해야 하는 항목이다.
- 이후 와이어프레임, 릴리스 노트, 소개 이미지에도 같은 이름을 사용해야 한다.
