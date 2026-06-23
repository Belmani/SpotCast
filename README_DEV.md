# SpotCast — Developer README

> Technical reference for contributors and maintainers.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | >=20.0.0 |
| Language | TypeScript | ^5.5.0 |
| Package manager | pnpm | 10.30.2 |
| Location data | HERE Browse + Geocoding API | — |
| Excel generation | ExcelJS | ^4.4.0 |
| Email sending | Nodemailer | ^6.9.0 |
| Scheduler | node-cron | ^3.0.3 |
| Template engine | Handlebars | ^4.7.0 |
| Config validation | Zod | ^3.23.0 |
| Logging | Winston | ^3.13.0 |
| Testing | Vitest | ^2.1.0 |
| Linting | ESLint | ^9.0.0 |

---

## Project Structure

```
spotcast/
│
├── SpotCast.ts / dist/SpotCast.js   ← entry point
├── config.json                       ← user config (gitignored)
├── config.example.json               ← committed template
├── geocache.json                     ← HERE geocoding cache (committed)
├── seen_firms.json                   ← deduplication store (gitignored)
│
├── src/
│   ├── config/
│   │   ├── ConfigLoader.ts           ← loads + validates config.json
│   │   ├── CitiesLoader.ts           ← loads + validates cities.json
│   │   └── ExcelConfigLoader.ts      ← loads + validates excel.json
│   ├── fetcher/
│   │   ├── Business.ts               ← Business model
│   │   ├── HereFetcher.ts            ← HERE Browse API connector
│   │   ├── HereCategoryMap.ts        ← label → HERE code map
│   │   └── GoogleFetcher.ts          ← DEPRECATED
│   ├── dedup/
│   │   └── DedupService.ts           ← seen_firms.json management
│   ├── excel/
│   │   └── ExcelExporter.ts          ← .xlsx generation
│   ├── mailer/
│   │   └── MailService.ts            ← email sending
│   ├── scheduler/                    ← M8 (REST API)
│   ├── api/                          ← M8 (REST API)
│   ├── logger.ts
│   └── i18n/
│       ├── translate.ts
│       └── format.ts
│
├── assets/
│   ├── cities/
│   │   ├── cities.example.json       ← committed template
│   │   └── cities.json               ← gitignored
│   ├── i18n/
│   │   └── en.json / de.json / ...
│   └── templates/
│       └── email.html
│
└── tests/
    ├── config/
    ├── fetcher/
    ├── dedup/
    ├── excel/
    ├── mailer/
    ├── i18n/
    └── SpotCast.test.ts
```

---

## Development Setup

```bash
git clone https://github.com/Belmani/SpotCast.git
cd SpotCast
npm install -g pnpm@10.30.2
pnpm install
cp config.example.json config.json
cp assets/cities/cities.example.json assets/cities/cities.json
# Fill in here_api_key and SMTP credentials
```

---

## Available Scripts

```bash
pnpm dev            # ts-node + nodemon hot-reload
pnpm build          # compile TypeScript → dist/
pnpm start          # run compiled build
pnpm test           # Vitest watch mode
pnpm test:run       # single run, no watch
pnpm test:coverage  # coverage report in /coverage
pnpm lint           # ESLint analysis
pnpm lint:fix       # auto-fix ESLint issues
pnpm typecheck      # type check without build
pnpm clean          # delete dist/
```

---

## Environment Variables

| Variable | Config field |
|---|---|
| `HERE_API_KEY` | `here_api_key` |
| `SMTP_USER` | `smtp.user` |
| `SMTP_PASS` | `smtp.pass` |

---

## Core Modules

### `ConfigLoader` (`src/config/ConfigLoader.ts`)
Loads `config.json`, validates with Zod, applies env var overrides. Fatal errors go to `process.stderr` — no Winston dependency at boot stage.

### `CitiesLoader` (`src/config/CitiesLoader.ts`)
Loads `assets/cities/cities.json`. Returns flat `string[]` of `"city, country"` pairs. Validates with Zod — fatal on empty array or missing required fields.

### `HereFetcher` (`src/fetcher/HereFetcher.ts`)
HERE Browse API connector. Receives `city_list: string[]` of `"city, country"` pairs from `CitiesLoader`. Paginates automatically (100 per page, `offset`-based). Geocoding cached in `geocache.json`. Errors on single combination are logged and skipped — never crash the pipeline.

### `HereCategoryMap` (`src/fetcher/HereCategoryMap.ts`)
Maps English labels (`"Bar"`) to HERE category codes (`"100-1000-0000"`). Validation happens in `ConfigLoader` — `HereFetcher` receives only already-validated codes.

### `DedupService` (`src/dedup/DedupService.ts`)
Tracks seen `place_id` values in `seen_firms.json`. `filter()` is read-only. `markSeen()` writes to disk — always called **after** email send, never before.

### `ExcelExporter` (`src/excel/ExcelExporter.ts`)
Generates `.xlsx` with three sheets. Column layout driven by `excel.json`. All visible strings from i18n — no hardcoded text.

### `MailService` (`src/mailer/MailService.ts`)
Nodemailer wrapper. Always sends when called — pipeline decides whether to call it. `useJsonTransport: true` for testing (no real SMTP).

---

## City Naming Convention

City names in `cities.json` must match the **official name on national cartography**. In multilingual countries, use the name in the language spoken in the geographic area:

- `"München"` not `"Munich"`
- `"Roma"` not `"Rome"`
- `"Genève"` for French-speaking Geneva
- `"Zürich"` for German-speaking Zurich
- `"Lugano"` for Italian-speaking Ticino

HERE Geocoding returns more accurate results with official local names.

---

## Pipeline Order

```
1. ConfigLoader.loadConfig()
2. CitiesLoader.loadCities(config.cities_file)
3. HereFetcher.fetchAll()           → Business[]
4. DedupService.filter()            → Business[] (new only)
5. [if empty → stop, no email]
6. ExcelExporter.export()           → path .xlsx
7. MailService.send()               → email + attachment
8. DedupService.markSeen()          → updates seen_firms.json
```

---

## Testing Strategy

**Coverage target: 80% minimum.**

```bash
pnpm test:run
pnpm test:coverage
```

**Key conventions:**
- Real temp files in `os.tmpdir()` — no `fs` mocking (hides serialisation bugs)
- `fetch` mocked globally in `HereFetcher` tests — no real HTTP
- `useJsonTransport: true` in `MailService` tests — no real SMTP
- Constructor mocks use `function`, not arrow functions (arrow functions cannot be constructors)

---

## Git Flow

```
main      ← stable releases only
develop   ← integration branch
feature/* ← one feature per branch
release/* ← release preparation
hotfix/*  ← urgent fixes on main
```

```bash
git flow feature start my-feature
git flow feature finish my-feature
git push origin develop
```

---

## Release Checklist

- [ ] All tests pass (`pnpm test:run`)
- [ ] Coverage ≥ 80% (`pnpm test:coverage`)
- [ ] No ESLint errors (`pnpm lint`)
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] `config.example.json` updated if schema changed
- [ ] `cities.example.json` updated if structure changed
- [ ] `CHANGELOG.md` updated
- [ ] Version bumped in `package.json`
- [ ] Milestone summary added to `docs/`
