# SpotCast — Technical and Architectural Decisions (DTR)

> This document records all significant technical and architectural decisions made during the project, with rationale and evaluated alternatives. Updated as the project evolves.

---

## DTR-001 — Language: TypeScript instead of Python

**Date:** 2026-05-26
**Status:** Accepted

**Decision:** Rewrite the original `google_maps_tracker.py` in TypeScript/Node.js instead of maintaining the Python codebase.

**Rationale:**
- The original Python script was provided by the client as a reference, not as a deliverable
- The team's primary stack is Node.js/TypeScript
- TypeScript offers strong typing, better IDE support and a mature ecosystem for all required dependencies
- Node.js runs natively on macOS (confirmed client requirement)

**Evaluated alternatives:**
- Keep Python: rejected — team has no Python expertise, unacceptable maintenance burden
- Migrate to Java: rejected — overkill for a backend tool of this scope

---

## DTR-002 — Single data connector: Google Places API only

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** Implement exclusively the Google Places API connector. Remove the Claude API connector present in the reference script. No abstract `IFetcher` interface.

**Rationale:**
- The reference Python script used Claude to generate fake business data as a development shortcut — no production value
- SpotCast's purpose is lead generation from real data
- A Google Places API key is available for development from day one; Onur will create his own at delivery
- `IFetcher` is speculative architecture: adds complexity with no second concrete connector on the horizon

**Evaluated alternatives:**
- Keep Claude connector as dev fallback: rejected — Google key available from day one
- Abstract `IFetcher` interface: deferred until (and if) a second data source becomes necessary

**Future note:** if a second source is added (e.g. Yelp, Foursquare), `IFetcher` will be introduced via refactor at that time.

---

## DTR-003 — REST API as bridge to the GUI (Express on port 3847)

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** SpotCast exposes a local REST API at `http://localhost:3847` via Express, as a communication bridge between the Node.js backend and the future JavaFX GUI (ForgeUI).

**Rationale:**
- The GUI will be built in JavaFX (Java), which cannot directly invoke Node.js internals
- Two architectural options evaluated:
  - **Child Process:** Java launches `node SpotCast.js` and reads stdout. Simple but unidirectional, fragile, not queryable
  - **REST API:** Node exposes HTTP endpoints; Java calls them. Bidirectional, structured JSON, queryable state, robust
- REST API chosen for robustness and future orientation
- Port `3847` to avoid conflicts with common development ports
- The REST server starts only in `--daemon` mode

**Evaluated alternatives:**
- WebSocket: rejected — overkill for request/response interaction
- gRPC: rejected — unjustified complexity for a local tool

---

## DTR-004 — Deduplication key: Google Place ID

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** Use `place_id` as the deduplication key in `seen_firms.json`.

**Rationale:**
- Names and addresses can change, causing false "new business" detections
- `place_id` is stable, unique and provided by the Google Places API on every result
- Guarantees a reliable long-term history

---

## DTR-005 — Configuration: config.json + environment variable overrides

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** All configuration lives in `config.json`. Sensitive fields (`google_api_key`, `smtp.user`, `smtp.pass`) are overridden by environment variables (`GOOGLE_API_KEY`, `SMTP_USER`, `SMTP_PASS`) when present.

**Rationale:**
- `config.json` provides a single, human-readable configuration file for end users
- Environment variables follow the 12-factor app convention for secrets
- `config.json` is gitignored; `config.example.json` (without secrets) is committed
- Secrets never touch the repository — cannot be accidentally shared

**M10+ Wizard integration:**
The graphical wizard will write non-sensitive values to `config.json` and set sensitive environment variables directly in the user's OS profile (`~/.zshrc` on macOS, system variables on Windows, `~/.profile` on Linux). Secrets never touch `config.json`.

---

## DTR-006 — Configuration validation: Zod

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** Use Zod v3 for `config.json` validation and automatic `Config` type inference.

**Rationale:**
- `JSON.parse()` returns `any` — TypeScript cannot guarantee anything about the structure of an external file
- Zod allows declaring schema, validation and type in a single declaration
- Field-by-field human-readable errors (e.g. `google_api_key is required`)
- The `Config` type is inferred automatically — no duplication between schema and TypeScript interface

**Version note:** Zod 4 is available but not yet production-stable. Consistent with the project's stability philosophy (see DTR-016).

**Evaluated alternatives:**
- Manual validation: rejected — verbose, repetitive, easy to forget
- `io-ts`: rejected — more complex API, higher learning curve for equivalent benefits

---

## DTR-007 — Logging: Winston

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** Use Winston as the logging system with file transport (`tracker.log`) and console (silenced in production).

**Rationale:**
- `fs.appendFileSync` is insufficient for a distributed tool: no levels, no formatting, no rotation
- Winston is the most mature logger in the Node.js ecosystem, production-ready
- `error/warn/info/debug` levels allow filtering noise in production
- Standardized log format: `[YYYY-MM-DD HH:mm:ss] LEVEL: message` — all in English
- Console silenced in production (`NODE_ENV=production`) to avoid disturbing the end user
- In critical pre-boot modules (e.g. `ConfigLoader`) `process.stderr.write` is used to avoid circular dependencies

---

## DTR-008 — Testing: Vitest

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** Use Vitest as the testing framework. TDD integrated into every milestone — tests are not optional.

**Rationale:**
- Vitest is ESM native, superior performance to Jest, identical API (drop-in replacement for those familiar with Jest)
- Clean and modern mocking API — `vi.mock()`, `vi.fn()`, `vi.spyOn()`
- Native TypeScript integration with no additional configuration
- Signals awareness of the modern ecosystem — a choice that communicates seniority
- Coverage provider `v8` via `@vitest/coverage-v8`

**Coverage target:** 80% minimum across all modules.

**Mocking note:** mocks of classes instantiated with `new` must use `function`, not arrow functions — arrow functions cannot be constructors in JavaScript. Lesson learned in M2.

**Async test note:** `it()` callbacks containing `await` (e.g. dynamic imports) must be declared `async`. Lesson learned in M3.

**Evaluated alternatives:**
- Jest: rejected — CommonJS-first architecture, inferior performance, more verbose TypeScript configuration
- Bun Test: rejected — ecosystem still too young for a project distributed to third parties

---

## DTR-009 — Data model: composition via Metadata

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** The base `Business` model is extended in subsequent milestones via composition (`EnrichedBusiness extends Business` with `metadata: Metadata[]` array), not via multiple inheritance or modification of the base model.

**Rationale:**
- The base `Business` model corresponds to what the Google Places API provides today — must remain stable
- Additional information varies by source and milestone — inheritance would create a rigid hierarchy
- Composition with `Metadata[]` is open by definition: every new piece of information is one more `Metadata`, zero changes to the base model
- Schema analogous to custom fields in an e-commerce catalog: infinitely extensible key/value
- `MetadataKey` enum extensible milestone by milestone without breaking changes

**Structure:**
```typescript
interface Metadata {
  key: string;           // MetadataKey enum or custom string
  value: string;
  source?: string;       // 'google' | 'manual' | 'enrichment_api'
  collected_at?: string; // ISO timestamp
}

interface EnrichedBusiness extends Business {
  metadata: Metadata[];
}
```

---

## DTR-010 — Discovery history: SQLite with better-sqlite3 (M11+)

**Date:** 2026-05-27
**Status:** Planned (M11+)

**Decision:** The `seen_firms.json` file will be replaced by a SQLite database managed via `better-sqlite3` to support the discovery history viewable from the GUI.

**Rationale:**
- `seen_firms.json` is sufficient for deduplication but not for historical queries
- SQLite is a single `.db` file in the project folder — zero servers, zero configuration, zero additional installation
- `better-sqlite3` is synchronous, performant and typed
- The world's most deployed database — proven reliability

**Evaluated alternatives:**
- MongoDB/CouchDB: rejected — requires separate server
- LowDB: rejected — not performant for historical queries
- PostgreSQL: rejected — total overkill

---

## DTR-011 — Internationalisation: 10 launch languages

**Date:** 2026-05-27
**Status:** Accepted

**Decision:** SpotCast ships with 10 languages at launch, selected to maximise worldwide user base coverage.

**Launch languages:** Italian, English, German, French, Spanish, Portuguese, Simplified Chinese, Japanese, Arabic, Turkish.

**Rationale:**
- The 10 languages cover over 80% of worldwide web traffic
- Turkish added for the relevance of the target market (initial client Onur) and the size of the user base (85M+ speakers)
- Arabic requires specific attention for RTL layout in Excel export
- Additional languages will arrive in subsequent milestones on community request

---

## DTR-012 — GUI: JavaFX via ForgeUI (M10+)

**Date:** 2026-05-27
**Status:** Planned (M10+)

**Decision:** The GUI will be built in JavaFX using the ForgeUI design system, developed in parallel with NomadSync. SpotCast serves as the ForgeUI pilot project.

**Rationale:**
- JavaFX is native, cross-platform and requires no server
- ForgeUI guarantees visual consistency between SpotCast and NomadSync
- The REST API (DTR-003) provides the bridge between the Java GUI and Node.js backend
- The web alternative (Next.js + Tailwind) would require a server — rejected

---

## DTR-013 — Graphical installer with wizard (M10+)

**Date:** 2026-05-27
**Status:** Planned (M10+)

**Decision:** SpotCast will include a graphical installer that automates the entire setup procedure.

**Rationale:**
- Manual installation is a barrier for non-technical users
- Distribution on Softonic requires a bulletproof experience
- The wizard is the natural entry point for the JavaFX/ForgeUI GUI

---

## DTR-014 — Pricing model: Freemium with Pro unlock from month 2

**Date:** 2026-05-27
**Status:** Accepted (business decision)

**Decision:** SpotCast is free for the first month. From month 2, advanced features require a Pro subscription at **€3.99/month** (or €39/year).

**Free plan:** base pipeline, up to 5 categories, up to 5 cities, daily schedule, 10 languages.

**Pro plan:** unlimited categories and cities, multi-week aggregated history, GUI-customisable email templates, priority support.

---

## DTR-015 — Distribution: MIT on GitHub + Softonic

**Date:** 2026-05-27
**Status:** Accepted (business decision)

**Decision:** SpotCast is distributed as open-source (MIT) on GitHub and published on Softonic and equivalent freeware platforms.

---

## DTR-016 — Dependency versioning policy

**Date:** 2026-06-04
**Status:** Accepted

**Decision:** Dependencies are pinned to the latest stable major version and updated deliberately, not chasing every new release. Priority given to compatibility with the real installed base of end users.

**Rationale:**
- SpotCast's end user is not a developer — the wizard will install Node for them
- The same philosophy governs Java 21 on NomadSync and ForgeUI: long-term stability > recent features
- Node.js `>=20.0.0`, pnpm `>=9.0.0` — thresholds covering 90%+ of current installations
- Express 4.x (not 5 RC), Zod 3.x (not 4 beta): confirmed stable major version in production

**Operational rule:** before updating a major version, verify compatibility with all project dependencies and document the decision in a new DTR.

---

## DTR-017 — Package manager: pnpm

**Date:** 2026-06-04
**Status:** Accepted

**Decision:** Use pnpm as the package manager instead of npm.

**Rationale:**
- npm had proven problematic in previous team projects (ToDoList) in combination with StoryBook
- pnpm is faster, deterministic and Docker-friendly
- Global store with hard links: faster installs, lighter `node_modules`
- Native workspaces for potential monorepo evolution
- `pnpm-lock.yaml` guarantees cross-machine reproducibility

**Version adopted:** pnpm 10.30.2 — latest version compatible with Node.js 18+ (pnpm 11 requires Node 22).

**Evaluated alternatives:**
- npm: rejected — problematic history in the team
- yarn v1: rejected — legacy, no longer actively developed
- yarn Berry: rejected — plug'n'play creates incompatibilities with some tools
- bun: rejected — ecosystem not sufficiently mature for production

---

## DTR-018 — ESLint: flat config with eslint.config.mjs

**Date:** 2026-06-04
**Status:** Accepted

**Decision:** Use ESLint 9 with flat config in `.mjs` (ES Module) format instead of the legacy `.eslintrc.json` format.

**Rationale:**
- ESLint 9 no longer supports `.eslintrc.*` — mandatory migration
- `.mjs` allows using `import/export` in the configuration file regardless of `"type"` in `package.json`
- Avoids having to add `"type": "module"` to `package.json`, which would require explicit `.js` extensions in all TypeScript imports — behaviour considered unacceptable by the team

**General rule:** CommonJS (`require`/`module.exports`) is forbidden in the codebase. If a specific tool requires it, the `.cjs` extension is used for that single file (convention already adopted in ToDoList for the StoryBook config).

---

## DTR-019 — Aggregated discovery statistics: deferred to M11+

**Date:** 2026-06-08
**Status:** Deferred (M11+)

**Decision:** No aggregated statistics structures (by category, city, historical totals) are implemented in `seen_firms.json` or anywhere else before M11+.

**Rationale:**
- Statistics by category and city require dynamic aggregation — not cleanly modelable in flat JSON
- Any structure invented now in JSON would be a workaround to discard at SQLite migration
- The principle: zero is better than wrong

**Future implementation (M11+):**
- SQLite with `better-sqlite3` as primary source
- Statistics via aggregate queries on the database
- `seen_firms.json` remains as offline fallback, without statistical fields

---

## DTR-020 — `first_seen` in the Business model

**Date:** 2026-06-08
**Status:** Accepted — implemented in M3

**Decision:** The `first_seen` field (ISO timestamp) is added to the `Business` model as an optional field. It is populated by `DedupService.markSeen()` at the time of first detection. `GoogleFetcher` does not know about it and leaves it `undefined`.

**Rationale:**
- Business information should live in the `Business` model, not duplicated in `seen_firms.json`
- `first_seen` is an attribute of the business, not of the deduplication system
- Natively available for M11+ when data migrates to SQLite

---

## DTR-021 — `seen_firms.json`: single responsibility

**Date:** 2026-06-08
**Status:** Accepted

**Decision:** `seen_firms.json` has one single responsibility: keeping the list of `place_id` values already sent. No other data lives in this file — no `first_seen`, no categories, no statistics, no counters.

**Final structure:**
```json
{
  "seen": ["ChIJ...", "ChIJ..."],
  "last_reset": "2026-06-04T08:00:00Z"
}
```

**Rationale:**
- Clear separation of responsibilities: deduplication in the file, business data in the model, statistics in M11+
- No duplication of information already present in `Business`
- Minimal file, fast, no risk of inconsistency

---

## DTR-022 — `last_seen` in the Business model

**Date:** 2026-06-10
**Status:** Accepted — implemented in M3

**Decision:** The `last_seen` field (ISO timestamp) is added to the `Business` model as an optional field, alongside `first_seen` (DTR-020). It is updated by `DedupService.markSeen()` on every run in which the business is present in the sent batch.

**Rationale:**
- `first_seen` tracks the first detection — invariant over time
- `last_seen` tracks the most recent detection — updated on every run
- The distinction is necessary for frequency and lead relevance analysis (e.g. "this dental practice appears every week")
- Both fields will be native columns in the M11+ SQLite table, with no data migration required

**Behaviour in `markSeen()`:**
- `first_seen`: written once, never overwritten — if already present on the object, it is preserved
- `last_seen`: always updated to the current execution timestamp

**Evaluated and rejected alternative:**
- `last_updated` (update of business metadata): rejected — has no producer in the system yet. Territory of M10+; adding it now would be speculative architecture (same principle as DTR-002 on `IFetcher`).

---

## DTR-023 — `DedupService`: injectable path in constructor

**Date:** 2026-06-10
**Status:** Accepted — implemented in M3

**Decision:** `DedupService` accepts an optional path in the constructor for the `seen_firms.json` file. The default is `path.resolve(process.cwd(), 'seen_firms.json')`.

```typescript
constructor(filePath = path.resolve(process.cwd(), 'seen_firms.json'))
```

**Rationale:**
- Same pattern adopted by `loadConfig(configPath?)` in M1 — consistency in the testability approach
- Allows tests to use isolated temporary directories (`os.tmpdir()`) without filesystem mocking
- Mocking `fs` hides real JSON serialisation bugs — real files are more reliable
- Zero impact on production usage: the default covers the nominal case

---

## DTR-024 — `DedupService`: lazy loading and synchronous writes

**Date:** 2026-06-10
**Status:** Accepted — implemented in M3

**Decision:** `DedupService` loads `seen_firms.json` lazily (on first use, not in the constructor) and writes to disk synchronously (`fs.writeFileSync`).

**Lazy loading rationale:**
- The file may not exist at instance construction time (first run)
- The process boot must not fail for a missing file
- The empty structure is created automatically on the first `markSeen()` or `reset()` call

**Synchronous write rationale:**
- The file is small (< 1 MB even after years of use — only an array of strings)
- Synchrony guarantees that `place_id` values are on disk even if the process is terminated immediately after the write
- The pipeline calls `markSeen()` as the last operation after sending the email — the added latency is negligible

**Corrupt file recovery:**
- Malformed JSON or invalid structure (`seen` is not an array) → warning on logger, restarts from empty structure
- Subsequent data is written correctly — no loss of future state

---

## DTR-025 — `excel.json`: column and sheet configuration

**Date:** 2026-06-10
**Status:** Accepted — to be implemented in M4

**Decision:** Excel export behaviour is governed by a dedicated configuration file `excel.json`, separate from `config.json`. It defines which columns are visible and which optional sheets are enabled.

**Structure:**
```json
{
  "columns": {
    "place_id":     false,
    "name":         true,
    "category":     true,
    "city":         true,
    "country":      true,
    "address":      true,
    "phone":        true,
    "website":      true,
    "rating":       true,
    "review_count": true,
    "maps_url":     false,
    "first_seen":   false
  },
  "include_email_templates": true
}
```

**Mandatory fields (cannot be disabled):** `name`, `category`, `city`, `address`. If a mandatory field is set to `false`, `ExcelExporter` throws a descriptive error instead of generating a meaningless file.

**Column order:** the order of keys in `columns` determines the column order in the sheet — no hardcoding in the exporter.

**Rationale:**
- Onur must be able to hide technical columns (`place_id`, `maps_url`) without modifying code
- File-based configurability avoids releasing a new version just to change the layout
- Separation from `config.json` keeps operational configuration distinct from presentation configuration
- Consistent with the single responsibility principle already applied to `seen_firms.json` (DTR-021)

**Evaluated alternatives:**
- Constructor parameters on `ExcelExporter`: rejected — not persistable, not modifiable by the end user
- Always include all columns: rejected — `place_id` and `maps_url` are noise for a non-technical user

---

## DTR-026 — Sheet 2 (Email Templates): configurable feature and seed for the M12 email panel

**Date:** 2026-06-10
**Status:** Accepted — to be implemented in M4

**Decision:** Sheet 2 "Email Templates" is an optional feature controlled by `excel.json → include_email_templates`. It generates one row per business with pre-filled email subject and body rendered via Handlebars, ready to copy into the user's email client.

**Sheet 2 column structure:**
```
name | category | city | email_subject | email_body
```
`name`, `category`, `city` are context columns — they identify the business without having to jump between sheets. Not all Sheet 1 fields are repeated.

**Handlebars templates — i18n keys:**
```json
"email_subject_template": "Partnership opportunity — {{name}}",
"email_body_template":    "Dear {{name}},\n\nI noticed your business in {{city}} and would love to connect.\n\nBest regards"
```
Available variables: all `Business` fields — `{{name}}`, `{{city}}`, `{{category}}`, `{{address}}`, `{{website}}`.

**Multi-line body:** `wrapText: true` on the `email_body` column alignment — the `\n` in the template becomes a visible line break in Excel.

**Roadmap connection:**
This sheet is the structural seed of the M12 email management panel. Templates already structured in M4 will avoid a refactor when M12 adds direct sending with status tracking (sent / replied / ignored).

**Rationale:**
- Immediate productivity tool for Onur with no automation — zero risk
- Configurable: those who don't want it disable it in `excel.json`
- Anticipates the M12 data structure at zero cost

---

## DTR-027 — `translate.ts`: shared i18n utility with cascading fallback

**Date:** 2026-06-10
**Status:** Accepted — to be implemented in M4

**Decision:** The translation function is extracted into a shared module `src/i18n/translate.ts`, used by all modules that require localised strings (`ExcelExporter`, `MailService`, `Scheduler`).

**Implementation:**
```typescript
export function t(
  key: string,
  i18n: Record<string, string>,
  fallback: Record<string, string>
): string {
  return i18n[key] ?? fallback[key] ?? key;
}
```

**Three fallback levels:**
1. Active language (`i18n`)
2. `en.json` as universal fallback (`fallback`)
3. The key itself as last resort — at least it's visible what's missing instead of an empty string

**Rationale:**
- Avoids duplicating fallback logic across every module
- The third level (key as fallback) makes missing keys immediately visible during development and QA
- Consistent with the DRY principle — one implementation, tested once
- Prerequisite for M8 (complete i18n) where an automated test will verify the presence of every key in every language file

**i18n loading:** each module receives the already-loaded dictionary as a parameter — `translate.ts` does not load files, only translates. Loading responsibility is separated, maximising testability.

---

## DTR-028 — Post v1.0.0 roadmap approved

**Date:** 2026-06-10
**Status:** Accepted (business and architecture decision)

**Decision:** The milestone roadmap following the first public release (v1.0.0) is approved in the following structure:

**v1.0.0 — Delivery to Onur + Softonic publication**

| Milestone | Content | Status |
|---|---|---|
| M1 | Scaffold and configuration | ✅ Complete |
| M2 | Google Places Fetcher | ✅ Complete |
| M3 | DedupService | ✅ Complete |
| M4 | Excel Export | 🔧 In progress |
| M5 | MailService | ⏳ |
| M6 | Scheduler + daemon | ⏳ |

**v1.1.0 — First post-launch update**

| Milestone | Content |
|---|---|
| M7 | REST API — Node.js ↔ JavaFX GUI bridge (Express port 3847) |
| M8 | Complete i18n — verify all keys in all languages, automated tests |
| M9 | Packaging and documentation — README, CHANGELOG, Softonic release |

**v1.2.0**

| Milestone | Content |
|---|---|
| M10 | GUI JavaFX + ForgeUI — dashboard, installation wizard, config form |

**v1.3.0**

| Milestone | Content |
|---|---|
| M11 | SQLite + discovery history — migration from `seen_firms.json`, statistics, GUI history view |

**v1.4.0**

| Milestone | Content |
|---|---|
| M12 | Email management panel — business selection, direct sending, status tracking (prerequisite: M10 + M11) |

**v2.0.0**

| Milestone | Content |
|---|---|
| M13 | Data enrichment — populating `Metadata[]` with email, LinkedIn, ad_budget from external sources |
| M14 | Multi-user and Pro licence — account management, freemium activation €3.99/month from month 2 |

**Rationale:**
- The roadmap correctly sequences architectural dependencies: M7 (REST API) prerequisite of M10 (GUI), M10 + M11 prerequisites of M12 (email panel)
- Each version is independently releasable and deliverable
- Sheet 2 from M4 (DTR-026) is the structural seed of M12 — zero-cost anticipation
- `Metadata[]` from M2 (DTR-009) is the structural seed of M13 — same philosophy

---

## DTR-029 — Policy: separate configuration files per domain

**Date:** 2026-06-10
**Status:** Accepted — cross-cutting policy across all milestones

**Decision:** Every functional domain that requires persistent configuration has its own dedicated file. No configuration file aggregates responsibilities from different domains.

**Project configuration files:**

| File | Domain | Gitignored |
|---|---|---|
| `config.json` | Operational configuration (API key, SMTP, schedule, languages) | ✅ |
| `config.example.json` | Committed template without secrets | ❌ |
| `excel.json` | Excel export presentation configuration (columns, sheets) | ❌ |
| `seen_firms.json` | Deduplication history (already-sent place_ids) | ✅ |

**Operational rule:** when the need to configure a new functional domain arises, a dedicated file is created — `config.json` is not extended. The new file follows the pattern: example file committed, real file gitignored if it contains sensitive or state data.

**Rationale:**
- Clear separation of responsibilities — each file has a single reason to change
- `config.json` stays readable and does not grow indefinitely
- Separate files can be versioned, committed or gitignored independently based on their nature
- Consistent with decisions already made: `seen_firms.json` separate from `config.json` (DTR-021), `excel.json` separate from `config.json` (DTR-025)
- Facilitates the M10+ wizard: each GUI configuration panel maps to a specific file

---

## DTR-030 — Code/asset separation: `assets/i18n/` for localisations

**Date:** 2026-06-10
**Status:** Accepted — implemented in M4

**Decision:** JSON localisation files (`en.json`, `it.json`, …) live in `assets/i18n/`. Translation code (`translate.ts`) stays in `src/i18n/`. The `assets/` folder collects everything that is neither TypeScript code nor root-level configuration.

**Structure:**
```
assets/
└── i18n/
    ├── en.json   ← reference language and universal fallback
    ├── it.json
    ├── tr.json
    └── ...       ← all language files

src/
└── i18n/
    └── translate.ts   ← code — t() utility with cascading fallback
```

**Rationale:**
- Established cross-discipline principle in web development: localisations, images, CSS and everything that is not code or configuration belongs in `assets/`
- Clear separation between compilable artefacts (`src/`) and static resources (`assets/`)
- Makes it easy to replace or update a language file without touching code
- Consistent with the convention already adopted for `templates/email.html`

**Operational rule:** any static non-code resource introduced in subsequent milestones follows the same principle and is placed under `assets/`.

---

## DTR-031 — Dynamic JSON imports: explicit use of `.default`

**Date:** 2026-06-10
**Status:** Accepted — lesson learned in M4

**Decision:** Dynamic imports of JSON files (`await import('…/file.json')`) must always access the `.default` property to extract the content with correct typing:

```typescript
// Correct
const en = (await import('../../assets/i18n/en.json')).default;

// Incorrect — generates ts(2352): 'default' property incompatible with Record<string, string>
const en = await import('../../assets/i18n/en.json');
```

**Rationale:**
- TypeScript with `esModuleInterop: true` and `resolveJsonModule: true` wraps JSON content in an object with a `default` key
- Without `.default` the resulting type includes the extra `default` property, incompatible with `Record<string, string>` and similar generic indices
- The compiler reports the error as `ts(2352)` — detected in M4 in `translate.test.ts` tests

**DTR-008 update (Testing):** tests that dynamically import JSON files must use `.default`. Lesson added to the Vitest practices note.

---

## DTR-032 — ExcelExporter: configurable columns with order from `excel.json`

**Date:** 2026-06-10
**Status:** Accepted — implemented in M4

**Decision:** Sheet 1 columns are determined exclusively by `excel.json`. The order of keys in the JSON determines the column order in the sheet. No column list is hardcoded in `ExcelExporter.ts`.

**Implementation:**
```typescript
const activeCols = Object.entries(this.excelConfig.columns)
  .filter(([, enabled]) => enabled)
  .map(([key]) => key);
```

**Rationale:**
- Onur can reorder columns by editing `excel.json` without touching code
- `Object.entries()` preserves key insertion order — behaviour guaranteed since ES2015+
- The `colKey → fieldName` and `colKey → i18nKey` mappings are declarative and centralised in the `COL_TO_FIELD` and `COL_TO_I18N_KEY` constants

---

## DTR-033 — ExcelExporter: manual auto-width after data insertion

**Date:** 2026-06-10
**Status:** Accepted — implemented in M4

**Decision:** ExcelJS does not provide native auto-fit. Column widths are calculated manually after all data has been inserted, with a final pass over each column:

```typescript
col.width = Math.max(MIN_COL_WIDTH, headerLen, maxDataLen) + COL_PADDING;
```

**Parameters:**
- `MIN_COL_WIDTH = 10` — guaranteed minimum width for columns with short or empty data
- `COL_PADDING = 2` — additional visual margin
- The calculation considers header and all data values — takes the maximum

**Rationale:**
- The calculation must happen after data insertion — it cannot be done in advance
- The minimum width prevents columns from being too narrow for optional data (e.g. `phone`, `website`)
- Established approach in the ExcelJS ecosystem — no third-party library needed

---

## DTR-034 — ExcelExporter: Handlebars compile once per template

**Date:** 2026-06-10
**Status:** Accepted — implemented in M4

**Decision:** Handlebars templates for Sheet 2 are compiled once before the business loop, not on every iteration:

```typescript
// Correct — compilation outside the loop
const subjectTemplate = Handlebars.compile(tr('email_subject_template'));
const bodyTemplate    = Handlebars.compile(tr('email_body_template'));

businesses.forEach(business => {
  const subject = subjectTemplate(business);
  const body    = bodyTemplate(business);
  // ...
});

// Incorrect — compilation inside the loop, O(n) unnecessary compilations
businesses.forEach(business => {
  const subject = Handlebars.compile(tr('email_subject_template'))(business);
});
```

**Rationale:**
- `Handlebars.compile()` performs template parsing and compilation — a non-trivial operation
- With N businesses in the batch, compiling inside the loop multiplies the cost by N with no benefit
- The template does not change between one business and the next — the compiled function is reusable

---

## DTR-035 — MailService: first recipient in `to`, all others in `bcc`

**Date:** 2026-06-11
**Status:** Accepted — to be implemented in M5

**Decision:** `MailService` sends a single email with the first address from `config.email_to` in `to` and all others in `bcc`. Recipients cannot see each other.

**Implementation:**
```typescript
to:  recipients[0],
bcc: recipients.slice(1).join(', '),
```
If `email_to` has a single recipient, `bcc` is an empty string — Nodemailer handles this correctly without errors.

**Rationale:**
- Protects recipient privacy — safer default for a tool distributed to third parties
- SpotCast may be resold or used in teams — exposing addresses to each other is unacceptable
- Zero additional complexity compared to the `to` multiple alternative
- Behaviour to be documented in the user README — not obvious to someone configuring `email_to`

**Evaluated alternatives:**
- All in `to`: rejected — exposes addresses to all recipients
- Separate email per recipient: rejected — overkill, N SMTP calls instead of one

---

## DTR-036 — MailService: async SMTP error wrapping

**Date:** 2026-06-11
**Status:** Accepted — to be implemented in M5

**Decision:** `MailService.send()` wraps `transporter.sendMail()` in a `try/catch`, logs the error with Winston, and **rethrows** — it does not autonomously decide whether the process should terminate.

```typescript
try {
  await transporter.sendMail(mailOptions);
  logger.info(`Email sent to ${config.email_to.length} recipient(s)`);
} catch (err) {
  logger.error(`SMTP error: ${(err as Error).message}`);
  throw err; // rethrow — the M6 pipeline decides
}
```

**Rationale:**
- `sendMail()` returns a Promise — the error is asynchronous. Without `try/catch` it becomes an `UnhandledPromiseRejection` which in Node.js 20+ terminates the process without a useful log
- `MailService` is dumb by design — it only knows how to send emails. It does not have the context to decide whether an SMTP error is fatal for the run
- The M6 pipeline catches the `throw` and decides: logs the run failure, but the daemon process stays alive for the next run

**Contract:** log and rethrow. Never swallow.

---

## DTR-037 — i18n: `format.ts` utility for localised dates and numbers

**Date:** 2026-06-11
**Status:** Accepted — to be implemented in M5 (blocking prerequisite)

**Decision:** Formatting dates and numbers according to the active language is extracted into `src/i18n/format.ts`, with three separate functions for three distinct use cases:

```typescript
formatDate(date: Date, i18n: Record<string, unknown>): string
// Reads i18n.formats.date — e.g. "DD/MM/YYYY" for IT, "YYYY年MM月DD日" for ZH

formatInteger(n: number, i18n: Record<string, unknown>): string
// Uses thousands_separator — for count, totals, counters
// Output: "1.234" (IT/DE) | "1,234" (EN) | "1 234" (FR)
// No decimals — "32.00 new businesses found" makes no sense

formatDecimal(n: number, i18n: Record<string, unknown>): string
// Uses decimal_separator and thousands_separator — for ratings, float values
// Output: "4,5" (IT) | "4.5" (EN)
// Removes trailing zeros — "4.0" → "4"
```

**Fallback:** if `i18n.formats` is absent or incomplete, defaults to EN behaviour (`YYYY-MM-DD`, `.` decimal, `,` thousands).

**Rationale:**
- Without localised formatting Onur's email shows "10/06/2026" in Italian and "2026-06-10" in English — inconsistent
- The `formatInteger` / `formatDecimal` separation avoids absurd output like "32.00 new businesses found"
- `format.ts` is the natural extension of `translate.ts` — same `src/i18n/` module, same philosophy (receives already-loaded dictionary, does not touch the filesystem)

**Note on `formats` as object:** `i18n.formats` is a nested object, not a string — `translate.ts` does not handle it. `format.ts` reads it directly via typed access.

---

## DTR-038 — MailService: HTML template with Handlebars, `\n` → `<br>` on i18n body

**Date:** 2026-06-11
**Status:** Accepted — to be implemented in M5

**Decision:** The email body is composed of two separate layers:

1. **Text body** (from i18n): `email_body` string compiled with Handlebars (`{{date}}`, `{{count}}`, `{{categories}}`, `{{cities}}`), then `\n` replaced with `<br>` — produces readable inline HTML
2. **HTML wrapper** (`templates/email.html`): static file with visual structure (font, colours, spacing), receives `{{{body}}}` as a Handlebars variable (triple-stache to avoid escaping the already-produced HTML)

**Variables available in the wrapper:**
```
{{date}}        — run date formatted with formatDate()
{{count}}       — business count formatted with formatInteger()
{{categories}}  — join ", " of categories from config
{{cities}}      — join ", " of cities from config
{{{body}}}      — i18n body with <br>, injected without escaping
```

**Rationale:**
- Separation of content and presentation: text changes per language, the HTML wrapper is invariant
- `\n` → `<br>` applied to the i18n body, not in the template — keeps JSON files readable as plain text
- Triple-stache `{{{body}}}` is necessary because the body already contains `<br>` tags — double-stache `{{body}}` would escape them to `&lt;br&gt;`
- Handlebars is already in the project (M4 ExcelExporter) — zero new dependencies

**Rejected alternative — MJML:** overkill for a simple transactional email with three variables. Solves cross-client compatibility problems that SpotCast does not have.

**Rejected alternative — React Email:** introduces React as a dependency in a pure Node.js backend. High cost, zero benefit for this use case.

---

## DTR-039 — i18n: `Record<string, unknown>` type for dictionaries with nested objects

**Date:** 2026-06-11
**Status:** Accepted — lesson learned in M5

**Decision:** i18n dictionaries must be typed as `Record<string, unknown>` throughout the codebase — not `Record<string, string>`. Where the value is certainly a string, an explicit `as string` cast is used.

```typescript
// Correct
export function t(
  key: string,
  i18n: Record<string, unknown>,
  fallback: Record<string, unknown>
): string {
  return (i18n[key] as string) || (fallback[key] as string) || key;
}

// Incorrect — incompatible with nested objects like formats
export function t(key: string, i18n: Record<string, string>, ...): string
```

**Rationale:**
- Adding `formats` as a nested object in M4 made `Record<string, string>` incompatible with the real structure of i18n files
- TypeScript reports `ts(2352)` when attempting to cast a type with non-string properties to `Record<string, string>`
- `Record<string, unknown>` is the correct type for any JSON dictionary with heterogeneous structure
- The `as string` cast at usage points is explicit and controlled — it does not hide bugs

**Impact:** updated `translate.ts`, `translate.test.ts` and all usage points.

---

## DTR-040 — Testing: fixture variables conflicting with Vitest functions

**Date:** 2026-06-11
**Status:** Accepted — lesson learned in M5

**Decision:** Fixture variables in tests must not share names with functions imported from Vitest (`it`, `describe`, `expect`, `vi`, `beforeEach`, `afterEach`). Adopted convention: `_` suffix for conflicting fixtures.

```typescript
// Incorrect — 'it' is a Vitest function, not a variable
const it = { formats: { date: 'DD/MM/YYYY' } };

// Correct
const it_ = { formats: { date: 'DD/MM/YYYY' } };
```

**Rationale:**
- Vitest imports `it` as a global function when `globals: true` is active in `vitest.config.ts`
- A local variable with the same name shadows the global function — tests fail with `TypeError: it is not a function`
- The `_` suffix is an established TypeScript convention for avoiding conflicts with reserved keywords and identifiers

**DTR-008 update (Testing):** lesson on fixture naming added.

---

## DTR-041 — Nodemailer jsonTransport: payload structure for test assertions

**Date:** 2026-06-11
**Status:** Accepted — lesson learned in M5

**Decision:** Nodemailer's `jsonTransport` serialises addresses as `{address, name}` objects and attachments as `content` (buffer), not as `path`. Tests must assert on the real payload structure, not on string representations.

**jsonTransport payload structure:**
```typescript
// Addresses — NOT flat strings
msg.to   // → Array<{ address: string; name: string }>
msg.bcc  // → Array<{ address: string; name: string }>
msg.from // → { address: string; name: string }

// Attachments — content resolved, path not present
msg.attachments // → Array<{ filename: string; content: Buffer }>

// Correct access
const to = msg.to as Array<{ address: string }>;
expect(to[0].address).toBe('primary@test.com');

// Incorrect — String() on an object produces '[object Object]'
expect(String(msg.to)).toContain('primary@test.com'); // FAILS
```

**Rationale:**
- The format is documented in Nodemailer's source code but not explicitly in the public documentation
- Discovered empirically in M5 — 4 tests failed on the first run for this reason
- The knowledge is now tracked to avoid the same issue in future suites using `jsonTransport`
