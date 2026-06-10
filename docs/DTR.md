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

**Launch languages:** Italian, English, German, French, Spanish, Portuguese, Simplified Chinese, Japanese, Arabic, Hindi.

**Rationale:**
- The 10 languages cover over 80% of worldwide web traffic
- Hindi added for the user base (600M+ speakers)
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
