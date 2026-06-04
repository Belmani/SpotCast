# Contributing to SpotCast

Thank you for your interest in contributing! SpotCast is open-source and welcomes contributions of all kinds — bug fixes, new features, translations, documentation improvements, and more.

---

## Before You Start

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

---

## How to Contribute

### Reporting a Bug

1. Check the [existing issues](https://github.com/Belmani/SpotCast/issues) to avoid duplicates
2. Open a new issue using the **Bug Report** template
3. Include: SpotCast version, operating system, Node.js version, steps to reproduce, expected vs actual behavior

### Suggesting a Feature

1. Check the [existing issues](https://github.com/Belmani/SpotCast/issues) and [discussions](https://github.com/Belmani/SpotCast/discussions)
2. Open a new issue using the **Feature Request** template
3. Describe the problem you are trying to solve, not just the solution

### Submitting a Pull Request

1. **Fork** the repository and clone your fork
2. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following the [code style guidelines](#code-style) below
4. Write or update tests — coverage must remain above 80%
5. Run the full check suite:
   ```bash
   pnpm test:run
   pnpm lint
   pnpm typecheck
   ```
6. Commit using [Conventional Commits](#commit-messages)
7. Push and open a Pull Request targeting `develop` — **never target `main` directly**
8. Fill in the PR template completely

---

## Development Setup

```bash
# Prerequisites: Node.js >=20, pnpm >=9
npm install -g pnpm@10.30.2

git clone https://github.com/Belmani/SpotCast.git
cd SpotCast
pnpm install
cp config.example.json config.json
# Fill in your Google API key and SMTP credentials
```

See [README_DEV.md](./README_DEV.md) for full development documentation.

---

## Code Style

- **TypeScript strict mode** — no `any`, no implicit types where avoidable
- **ESLint** — run `pnpm lint` before committing; zero errors and zero warnings required
- **No `console.log`** — use the shared `logger` from `src/logger.ts`
- **No `require()`** — ES imports only; use `.cjs` extension only if a tool strictly requires CommonJS
- All identifiers, property names, log messages, and comments in **English**

---

## Commit Messages

SpotCast uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Excel export with three sheets
fix: handle empty Google Places API response
docs: update installation guide for Windows
test: add DedupService unit tests
chore: upgrade ExcelJS to 4.5.0
refactor: extract email rendering to MailService
style: fix ESLint warnings in ConfigLoader
```

---

## Adding a New Language

SpotCast ships with 10 languages. To add a new one:

1. Copy `src/i18n/en.json` → `src/i18n/{lang}.json`
2. Translate all values — keep all keys identical
3. Add the language code to the Zod enum in `src/config/ConfigLoader.ts`
4. Open a PR with title: `feat: add {Language} translation`

---

## Questions?

Open a [Discussion](https://github.com/Belmani/SpotCast/discussions) — we are happy to help.
