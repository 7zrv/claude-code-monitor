# Contributing to Codex Pulse

Thank you for your interest in contributing to Codex Pulse!

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) >= 20
- npm

## Getting Started

```bash
# Clone the repository
git clone https://github.com/<owner>/codex-pulse.git
cd codex-pulse

# Install Node dependencies
npm install

# Build the Rust backend
cargo build --release

# Run checks
npm run check
```

## Development Workflow

1. Fork the repository and create a branch from `main`:
   - `feat/<name>` for new features
   - `fix/<name>` for bug fixes
   - `docs/<name>` for documentation changes
   - `refactor/<name>` for refactoring
2. Make your changes and commit using [Conventional Commits](#commit-convention).
3. Ensure all checks pass: `npm run check`
4. Open a Pull Request against `main`.

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `ci`

**Scopes (optional):** `api`, `sse`, `ui`, `desktop`, `collector`, `docs`

**Rules:**
- Subject line: 70 characters max, lowercase start, no period
- Breaking changes: add `BREAKING CHANGE:` in the commit footer

**Examples:**
```
feat(api): add token usage endpoint
fix(sse): reconnect on timeout
docs(readme): add installation instructions
```

## Pull Requests

- Fill out the PR template.
- Ensure CI passes (`cargo check`, `npm run check`).
- Keep PRs focused — one logical change per PR.

## Reporting Issues

Use the provided issue templates for bug reports and feature requests.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
