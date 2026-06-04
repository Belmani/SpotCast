# Changelog

All notable changes to SpotCast will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2026-06-04

### Added
- Project scaffold: TypeScript 5, pnpm 10, nodemon, ts-node
- `ConfigLoader` with Zod v3 validation and environment variable overrides for secrets
- `GoogleFetcher` — Google Places API connector with `textSearch`, result mapping, error handling, and `results_per_run` limit enforcement
- `Business`, `EnrichedBusiness`, and `Metadata` data models with composition-based extensibility
- `logger.ts` — shared Winston logger with file and console transports
- Vitest test suites for `GoogleFetcher` (17 tests) and `ConfigLoader` (16 tests)
- ESLint 9 flat config (`eslint.config.mjs`) with `@typescript-eslint` rules
- `vitest.config.ts` with 80% coverage thresholds
- `config.example.json` template
- `README.md` and `README_DEV.md`
- MIT license
- Git Flow workflow with branch protection on `main`

[0.1.0]: https://github.com/Belmani/SpotCast/releases/tag/0.1.0
