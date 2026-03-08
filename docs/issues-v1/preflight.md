# Claude Code Monitor v1 이슈 등록 전 최종 점검표

- 작성일: 2026-03-08
- 목적: `gh issue create --run` 실행 전에 중복 생성, 라벨 누락, 인증 오류를 막는다.

## 1. 언제 쓰는가

아래 상황에서 이 문서를 먼저 본다.

- 특정 배치를 실제 GitHub에 등록하기 직전
- `create.sh --run`을 처음 실행하기 전
- 다른 저장소나 포크로 이슈를 올리기 전

## 2. 공통 Go / No-Go 체크

모두 `Yes`여야 실행한다.

- [ ] 올릴 배치를 결정했다. 예: `batch-1`
- [ ] 해당 배치의 압축 등록본을 마지막으로 읽었다
- [ ] 제목과 라벨이 현재 우선순위와 맞다
- [ ] 이전에 같은 제목의 이슈를 올린 적이 없는지 확인했다
- [ ] 대상 저장소가 맞다
- [ ] `gh` 로그인 상태가 유효하다
- [ ] 필요한 라벨이 저장소에 존재한다
- [ ] 지금 이 배치를 올릴 선행 조건이 충족됐다

하나라도 `No`면 `--run`을 실행하지 않는다.

## 3. 배치별 선행 조건

### Batch 1

- 제품 기준선과 신뢰성 논의를 먼저 열고 싶을 때
- 다른 배치보다 먼저 올린다

### Batch 2

- `V1-02` 상태 모델 이슈를 이미 올렸거나, 최소한 등록 순서상 앞에 두었을 때
- 핵심 진단 UX 이슈를 한 번에 묶어 관리하고 싶을 때

### Batch 3

- Batch 1, 2가 이미 열려 있어야 한다
- `V1-12`를 단순 polish가 아니라 출시 차단 이슈로 추적할 준비가 돼 있어야 한다

### Batch 4

- v1 컷라인 이슈와 분리된 후속 확장 트랙으로 관리할 때
- 당장 구현 우선순위를 높이지 않을 때

## 4. 권장 실행 순서

1. [issue-order.md](/Users/yunseojin/claude-code-monitor/docs/issues-v1/issue-order.md)를 읽는다
2. 해당 배치의 `batch-*-final.md`를 읽는다
3. `preflight.sh`로 자동 점검을 돌린다
4. 이상이 없으면 해당 배치 `create.sh --run`을 실행한다

## 5. 자동 점검 스크립트

스크립트:
[preflight.sh](/Users/yunseojin/claude-code-monitor/docs/issues-v1/gh/preflight.sh)

사용:

```bash
docs/issues-v1/gh/preflight.sh batch-1
docs/issues-v1/gh/preflight.sh batch-2
docs/issues-v1/gh/preflight.sh batch-3
docs/issues-v1/gh/preflight.sh batch-4
```

이 스크립트는 아래를 확인한다.

- `gh` 설치 여부
- `gh auth status`
- 대상 저장소 접근 가능 여부
- 배치 스크립트와 body 파일 존재 여부
- 배치에서 필요한 라벨 존재 여부
- 같은 제목의 이슈가 이미 있는지 여부

## 6. 수동 확인 명령

인증 확인:

```bash
gh auth status
```

저장소 확인:

```bash
gh repo view 7zrv/claude-code-monitor
```

라벨 확인:

```bash
gh api "repos/7zrv/claude-code-monitor/labels?per_page=100" --paginate --jq '.[].name'
```

예시 중복 제목 확인:

```bash
gh api search/issues -f q='repo:7zrv/claude-code-monitor is:issue "docs: 제품명과 주요 UI 라벨 통일하기" in:title'
```

## 7. 실행 직전 마지막 확인

- [ ] 내가 지금 올리려는 배치가 맞다
- [ ] `Preview mode` 출력이 기대한 제목/라벨과 같다
- [ ] 중복 이슈가 없거나, 있어도 의도적으로 새로 만드는 상황이다
- [ ] 저장소가 `7zrv/claude-code-monitor` 또는 내가 지정한 `GH_REPO`가 맞다

## 8. 실행 명령

예시:

```bash
docs/issues-v1/gh/batch-1/create.sh --run
docs/issues-v1/gh/batch-2/create.sh --run
docs/issues-v1/gh/batch-3/create.sh --run
docs/issues-v1/gh/batch-4/create.sh --run
```

다른 저장소로 보낼 때:

```bash
GH_REPO=owner/repo docs/issues-v1/gh/batch-1/create.sh --run
```

## 9. 실패했을 때 확인 순서

1. `gh auth status`
2. 저장소 이름 확인
3. 라벨 존재 여부 확인
4. 동일 제목 이슈 존재 여부 확인
5. body 파일 경로 확인

## 10. 권장 운영 방식

- 같은 날에는 Batch 1과 Batch 2까지만 먼저 올리는 것이 안전하다
- Batch 3는 실제 구현 우선순위가 보일 때 올린다
- Batch 4는 별도 확장 트랙으로 분리해도 된다
