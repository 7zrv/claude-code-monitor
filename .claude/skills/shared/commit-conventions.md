# 공통 커밋 규칙

`/commit`과 `/ship` skill이 공유하는 커밋 규칙이다.

## 스테이징

1. `git diff` 또는 `git diff --cached`로 변경 내용을 상세 확인한다
2. `git add <file>...`로 관련 파일만 개별 스테이징한다 — **`git add -A`나 `git add .` 사용 금지**
3. `.env`, credentials 등 시크릿이 포함된 파일은 커밋하지 않는다

## 커밋 메시지 형식

[Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따른다:

```
<type>(<scope>): <한국어 설명>
```

- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
- **Scopes** (optional): `api`, `sse`, `ui`, `desktop`, `skills`, `docs`
- **description은 반드시 한국어로 작성한다** (type, scope은 영어 유지)
- Subject line: max 70 chars, no period
- `$ARGUMENTS`가 제공되면 커밋 메시지 기반으로 사용한다
- 예시: `feat(api): 세션 파싱 기능 추가`, `fix(ui): 대시보드 렌더링 오류 수정`

## Co-Authored-By

항상 아래 트레일러를 추가한다:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## HEREDOC 형식

커밋 메시지는 반드시 HEREDOC으로 전달한다:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <한국어 설명>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## 커밋 후 확인

`git status`로 커밋 성공 여부를 확인한다.
