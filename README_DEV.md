# SpotCast — Developer README

> Technical reference for contributors and maintainers.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | >=20.0.0 |
| Language | TypeScript | ^5.5.0 |
| Package manager | pnpm | 10.30.2 |
| HTTP server | Express | ^4.21.0 |
| Google Maps | `@googlemaps/google-maps-services-js` | ^3.4.2 |
| Excel generation | ExcelJS | ^4.4.0 |
| Email sending | Nodemailer | ^6.9.0 |
| Scheduler | node-cron | ^3.0.3 |
| Config validation | Zod | ^3.23.0 |
| Logging | Winston | ^3.13.0 |
| Testing | Vitest | ^2.1.0 |
| Linting | ESLint | ^9.0.0 |

---

## Project Structure

```
spotcast/
│
├── SpotCast.ts              ← entry point (CLI and daemon mode)
│
├── config.json              ← operational configuration (gitignored)
├── config.example.json      ← template committed to repo
├── excel.json               ← Excel export configuration (gitignored)
├── excel.example.json       ← template committed to repo
├── seen_firms.json          ← deduplication history (gitignored)
├── tracker.log              ← execution log (gitignored)
├── eslint.config.mjs        ← ESLint 9 flat config
├── vitest.config.ts         ← Vitest configuration
├── nodemon.json             ← nodemon hot-reload config
│
├── assets/
│   └── i18n/                ← localisations — not code
│       ├── en.json          ← reference language (universal fallback)
│       ├── it.json
│       ├── de.json
│       ├── fr.json
│       ├── es.json
│       ├── pt.json
│       ├── zh.json
│       ├── ja.json
│       ├── ar.json
│       └── tr.json
│
├── src/
│   ├── config/
│   │   ├── ConfigLoader.ts       ← loads, validates and merges config.json + env vars
│   │   └── ExcelConfigLoader.ts  ← loads and validates excel.json (M4)
│   ├── fetcher/
│   │   ├── Business.ts           ← Business, EnrichedBusiness, Metadata models
│   │   └── GoogleFetcher.ts      ← Google Places API connector
│   ├── dedup/
│   │   └── DedupService.ts       ← seen_firms.json management
│   ├── excel/
│   │   └── ExcelExporter.ts      ← .xlsx generation (M4)
│   ├── mailer/
│   │   └── MailService.ts        ← email sending (M5)
│   ├── scheduler/
│   │   └── Scheduler.ts          ← node-cron wrapper (M6)
│   ├── api/
│   │   └── RestServer.ts         ← REST API Express port 3847 (M7)
│   ├── i18n/
│   │   └── translate.ts          ← t() utility with cascading fallback
│   └── logger.ts                 ← shared Winston logger
│
├── templates/
│   └── email.html               ← Handlebars email template
│
├── results/                     ← Excel output (gitignored)
└── tests/
    ├── config/
    │   ├── ConfigLoader.test.ts
    │   └── ExcelConfigLoader.test.ts
    ├── fetcher/
    │   └── GoogleFetcher.test.ts
    ├── dedup/
    │   └── DedupService.test.ts
    ├── excel/
    │   └── ExcelExporter.test.ts
    └── i18n/
        └── translate.test.ts
```

### Structure convention

| Folder | Contents |
|---|---|
| `src/` | All TypeScript code — modules, classes, utilities |
| `assets/` | Everything that is not code: localisations, static templates |
| `tests/` | Vitest suites — mirrors the `src/` structure |
| root | Project configuration files (`*.json`, `*.ts`, `*.mjs`) |

---

## Configuration Files

Each functional domain has its own dedicated file (DTR-029):

| File | Domain | Committed |
|---|---|---|
| `config.json` | Operational configuration (API key, SMTP, schedule) | ❌ gitignored |
| `config.example.json` | Template without secrets | ✅ |
| `excel.json` | Excel export layout (columns, sheets) | ✅ |
| `seen_firms.json` | Deduplication history | ❌ gitignored |

---

## Development Setup

```bash
# Clone
git clone https://github.com/Belmani/SpotCast.git
cd SpotCast

# Install pnpm if needed
npm install -g pnpm@10.30.2

# Install dependencies
pnpm install

# Copy configuration files
cp config.example.json config.json
cp excel.example.json excel.json
# Fill in google_api_key and SMTP credentials in config.json

# Start in development mode (hot-reload)
pnpm dev

# Production build
pnpm build && pnpm start
```

---

## Available Scripts

```bash
pnpm dev            # ts-node + nodemon hot-reload
pnpm build          # compile TypeScript → dist/
pnpm start          # run compiled build
pnpm test           # Vitest in watch mode
pnpm test:run       # single run, no watch
pnpm test:coverage  # coverage report in /coverage
pnpm lint           # ESLint analysis
pnpm lint:fix       # auto-fix ESLint issues
pnpm typecheck      # type check without build
pnpm clean          # delete dist/
```

---

## Environment Variables

Sensitive values override the corresponding fields in `config.json` when present:

| Variable | Config field |
|---|---|
| `GOOGLE_API_KEY` | `google_api_key` |
| `SMTP_USER` | `smtp.user` |
| `SMTP_PASS` | `smtp.pass` |

```bash
# macOS / Linux
export GOOGLE_API_KEY="AIzaSy..."

# Windows
setx GOOGLE_API_KEY "AIzaSy..."
```

---

## Core Modules

### ConfigLoader (`src/config/ConfigLoader.ts`)

Loads `config.json`, validates with Zod schema, applies environment variable overrides. Fatal errors are written to `process.stderr` — no Winston dependency at boot time, to avoid circular imports.

```typescript
export type Config = z.infer<typeof ConfigSchema>;
export function loadConfig(configPath = 'config.json'): Config
```

### ExcelConfigLoader (`src/config/ExcelConfigLoader.ts`)

Loads `excel.json`, validates with Zod. Protects mandatory fields (`name`, `category`, `city`, `address`) — throws a descriptive error if any of them are disabled.

```typescript
export type ExcelConfig = z.infer<typeof ExcelConfigSchema>;
export function loadExcelConfig(configPath = 'excel.json'): ExcelConfig
```

### GoogleFetcher (`src/fetcher/GoogleFetcher.ts`)

Wraps `@googlemaps/google-maps-services-js`. For each `(category × city)` combination in config, performs a `textSearch` query and maps results to the internal `Business` model. Never throws on API errors — returns partial results.

```typescript
fetchAll(): Promise<Business[]>
fetchOne(category, city, limit): Promise<Business[]>
```

### Business model (`src/fetcher/Business.ts`)

```typescript
interface Business {
  place_id: string;
  name: string;
  category: string;
  city: string;
  country: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  maps_url: string;
  first_seen?: string;  // ISO — set by DedupService.markSeen() on first detection
  last_seen?: string;   // ISO — updated by DedupService.markSeen() on every run
}
```

### DedupService (`src/dedup/DedupService.ts`)

Manages `seen_firms.json`. Path injectable via constructor for testability.

```typescript
constructor(filePath?: string)
filter(businesses: Business[]): Business[]
markSeen(businesses: Business[]): void   // call AFTER sending email
reset(): void
```

### ExcelExporter (`src/excel/ExcelExporter.ts`)

Generates the `.xlsx` file with three sheets. Receives already-loaded i18n dictionaries as parameters — does not load them itself.

```typescript
constructor(config: Config, excelConfig: ExcelConfig)
async export(
  businesses: Business[],
  duplicatesSkipped: number,
  i18n: Record<string, string>,
  fallback: Record<string, string>
): Promise<string>  // returns the absolute path of the generated file
```

### translate (`src/i18n/translate.ts`)

Shared utility with three-level cascading fallback (DTR-027).

```typescript
// Fallback chain: i18n[key] → fallback[key] → key
export function t(
  key: string,
  i18n: Record<string, string>,
  fallback: Record<string, string>
): string
```

### Logger (`src/logger.ts`)

Shared Winston instance. Levels: `error/warn/info/debug`. File transport always active; console transport silenced in production.

---

## i18n System

Localisations live in `assets/i18n/` — clean separation between code (`src/`) and static resources (`assets/`). The translation logic lives in `src/i18n/translate.ts`.

**10 launch languages:** `it`, `en`, `de`, `fr`, `es`, `pt`, `zh`, `ja`, `ar`, `tr`

Loading the active language file is the caller's responsibility — `translate.ts` receives already-loaded dictionaries and does not touch the filesystem.

To add a new language:
1. Copy `assets/i18n/en.json` → `assets/i18n/{lang}.json`
2. Translate all values (keep keys identical)
3. Add the language code to the Zod enum in `ConfigLoader.ts`
4. Open a PR

---

## Testing Strategy (Vitest)

**Coverage target: 80% minimum across all modules.**

```bash
pnpm test:run                    # run all tests once
pnpm test:coverage               # generate HTML coverage report
```

**Philosophy:** real files in `os.tmpdir()` instead of filesystem mocks — mocking libraries hides real serialisation bugs. Applied to `DedupService` (JSON) and `ExcelExporter` (xlsx).

**Constructor mocking note:** mocks of classes instantiated with `new` must use `function`, not arrow functions.

**Async test note:** `it()` callbacks containing `await` must be declared `async`.

---

## Git Flow

```
main          ← stable releases only — never commit directly
develop       ← integration branch — all features merge here
feature/xxx   ← one feature per branch, branched from develop
release/xxx   ← release preparation, branched from develop
hotfix/xxx    ← urgent fixes on main
```

```bash
git flow feature start my-feature
# ... develop ...
git flow feature finish my-feature  # merges to develop, deletes branch
git push origin develop

# Release
git flow release start 0.2.0
git flow release finish -m "v0.2.0 — description" 0.2.0
git push origin main develop --tags
```

---

## Dependency Versioning Policy

Dependencies pinned to the latest **stable** major version. No updates to RC or beta releases. Before updating a major version, verify compatibility and document the decision in a new DTR.

Current constraints:
- Node.js `>=20.0.0`
- Express `^4.x` (v5 still in RC)
- Zod `^3.x` (v4 not yet production-stable)

---

## Release Checklist

- [ ] All tests pass (`pnpm test:run`)
- [ ] Coverage ≥ 80% (`pnpm test:coverage`)
- [ ] No ESLint errors (`pnpm lint`)
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] `config.example.json` updated if new fields were added
- [ ] `excel.example.json` updated if new fields were added
- [ ] `seen_firms.json` and `config.json` present in `.gitignore`
- [ ] `CHANGELOG.md` updated
- [ ] Version bumped in `package.json`
- [ ] Milestone summary added in `docs/`
