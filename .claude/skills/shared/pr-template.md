# 공통 PR 생성 규칙

`/pr`과 `/ship` skill이 공유하는 PR 생성 규칙이다.

## 1. 브랜치 최신화 (Rebase)

```bash
git fetch origin main
git rebase origin/main
```

- 충돌이 발생하면 `git rebase --abort`로 롤백하고, 사용자에게 충돌 파일 목록을 안내한 뒤 중단한다
- rebase 후 변경이 있고 이미 push된 브랜치라면 `git push --force-with-lease`로 푸시한다

## 2. 리모트 푸시

- upstream이 없으면 `git push -u origin <branch>`
- upstream이 있으면 `git push`
- **main/master에 직접 push 금지**

## 3. 관련 이슈 번호 결정

- `$ARGUMENTS`에 이슈 번호가 있으면 해당 값을 사용
- 없으면 브랜치명 끝의 숫자를 이슈 번호로 추출 (예: `feat/add-cache-18` → `18`)
- `Closes #<이슈번호>`를 PR 본문에 포함

## 4. PR 생성

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points summarizing the changes>

## Changes
<list of key changes>

## Related Issue
Closes #<issue-number>

## Test Plan
- [ ] `cargo fmt --check` pass
- [ ] `cargo clippy -- -D warnings` pass
- [ ] `cargo test` pass
- [ ] `npm run check` pass
- [ ] Manual verification of related functionality

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 5. PR 제목 규칙

- 70자 이내
- Conventional Commit 스타일
- 한국어 설명

## 6. 완료

PR URL을 반환한다.
