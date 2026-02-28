# Design Tokens (2-Color Constraint)

## Color
- `--warm`: `#E26D5C`
- `--warm-text`: `#B84A3A` (텍스트 전용, 대비 개선)
- `--paper`: `#F6EDE3`

## Rule
- 추가 색상 금지 (`--warm-text`는 `--warm`의 명도 보정값)
- 텍스트에는 `--warm-text` 사용
- 장식 요소(border, gradient, chart stroke)는 `--warm` 사용
- 상태 구분은 색상 대신 border style / border width / 텍스트 사용

## Typography
- Primary: `Avenir Next`
- Fallback: `Noto Sans KR`

## Font Size Scale
- `--text-xs`: `10px` (차트 축/보조 라벨)
- `--text-sm`: `11px` (badge, status-pill, 레전드)
- `--text-caption`: `12px` (카드 라벨)
- `--text-base`: `13px` (이벤트 행)
- `--text-md`: `14px` (테이블 본문, 차트 제목)
- `--text-lg`: `29px` (카드 메트릭 값)

## Spacing Scale
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-5`: `24px`
- `--space-6`: `32px`

## Border Radius
- `--radius-sm`: `6px` (tooltip)
- `--radius-md`: `8px` (input/select/chart)
- `--radius-lg`: `10px` (event/workflow/chart-card)
- `--radius-xl`: `14px` (card/panel)
- `--radius-pill`: `999px` (badge/status-pill)

## Background Gradient
- 허용: `radial-gradient` + `--warm` 10~20% 투명도
- 최대 2개 레이어

## Status Language
- `connected`, `reconnecting`, `offline`
- `running`, `at-risk`, `blocked`, `idle`
