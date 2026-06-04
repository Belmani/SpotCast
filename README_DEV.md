# SpotCast — Developer README

> Technical reference for contributors and maintainers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5+ |
| HTTP Server | Express 4 |
| Google Maps | `@googlemaps/google-maps-services-js` |
| Excel generation | ExcelJS |
| Email sending | Nodemailer |
| Scheduler | node-cron |
| Config validation | Zod |
| Logging | Winston |
| Testing | Vitest |
| Linting | ESLint + Prettier |

---

## Project Structure

```
spotcast/
│
├── SpotCast.ts              ← entry point (CLI and daemon mode)
├── config.json              ← user configuration (gitignored)
├── config.example.json      ← template committed to repo
├── seen_firms.json          ← deduplication history (gitignored)
├── tracker.log              ← execution log (gitignored)
│
├── src/
│   ├── config/
│   │   └── ConfigLoader.ts      ← loads, validates and merges config + env vars
│   ├── fetcher/
│   │   └── GoogleFetcher.ts     ← Google Places API connector
│   ├── dedup/
│   │   └── DedupService.ts      ← seen_firms.json management
│   ├── excel/
│   │   └── ExcelExporter.ts     ← .xlsx generation with ExcelJS
│   ├── mailer/
│   │   └── MailService.ts       ← email sending with Nodemailer
│   ├── scheduler/
│   │   └── Scheduler.ts         ← node-cron wrapper
│   ├── api/
│   │   └── RestServer.ts        ← Express REST API (port 3847)
│   └── i18n/
│       ├── it.json
│       ├── en.json
│       ├── de.json
│       ├── fr.json
│       ├── es.json
│       ├── pt.json
│       ├── zh.json
│       ├── ja.json
│       ├── ar.json
│       └── hi.json
│
├── templates/
│   └── email.html               ← HTML email template (Handlebars)
│
├── results/                     ← Excel output (gitignored)
├── tests/                       ← Vitest test suites
└── docs/                        ← DTR, GRM, ADR documents
```

---

## Development Setup

```bash
# Install dependencies
npm install

# Copy configuration
cp config.example.json config.json
# Fill in your Google API key and SMTP credentials

# Start in development mode (ts-node + nodemon, hot-reload)
npm run dev

# Production build
npm run build

# Run compiled build
npm start

# Run tests
npm test

# Tests with coverage report
npm run test:coverage

# Linting
npm run lint
```

---

## Environment Variables and Secret Management

### The principle

`config.json` manages all functional settings and can be versioned in the repo with placeholder values. Sensitive fields — API keys and SMTP credentials — must never be committed. The environment variable override mechanism solves this: `ConfigLoader` reads env vars first and, when present, uses them ignoring the value in `config.json`.

### Supported environment variables

| Variable | Corresponding config field |
|---|---|
| `GOOGLE_API_KEY` | `google_api_key` |
| `SMTP_USER` | `smtp.user` |
| `SMTP_PASS` | `smtp.pass` |

### Manual setup (development)

```bash
# macOS / Linux — current session
export GOOGLE_API_KEY="AIzaSy..."
export SMTP_USER="your@email.com"
export SMTP_PASS="xxxx xxxx xxxx"

# To make them permanent, add to ~/.zshrc or ~/.bashrc
echo 'export GOOGLE_API_KEY="AIzaSy..."' >> ~/.zshrc

# Windows — Command Prompt (current session)
set GOOGLE_API_KEY=AIzaSy...

# Windows — permanent (requires terminal restart)
setx GOOGLE_API_KEY "AIzaSy..."
```

### Configuration wizard (M10+)

The JavaFX graphical wizard (ForgeUI) will automate the entire configuration process. Expected flow:

```
Wizard starts
     ↓
Text fields for each property (defaults pre-filled, except secrets)
     ↓
ConfigLoader writes config.json with non-sensitive values
     ↓
For GOOGLE_API_KEY, SMTP_USER, SMTP_PASS:
  → wizard sets persistent environment variables in the user's OS profile
     ↓
     macOS:   writes to ~/.zshrc
     Windows: calls SetEnvironmentVariable() in system variables
     Linux:   writes to ~/.profile
     ↓
Secrets never touch config.json — never written to disk in plaintext
     ↓
Progress bar: npm dependencies → TS backend → Java UI → ForgeUI
     ↓
Google API + SMTP connection test before completing
     ↓
Wizard complete — SpotCast ready to use
```

### ConfigLoader implementation

```typescript
import { z } from 'zod';
import fs from 'fs';

const ConfigSchema = z.object({
  language: z.enum(['it','en','de','fr','es','pt','zh','ja','ar','hi']).default('en'),
  google_api_key: z.string().min(1, 'google_api_key is required'),
  categories: z.array(z.string()).min(1),
  cities: z.array(z.string()).min(1),
  countries: z.array(z.string()).min(1),
  results_per_run: z.number().int().positive().default(10),
  schedule: z.string().default('0 8 * * *'),
  output_dir: z.string().default('results'),
  smtp: z.object({
    host: z.string(),
    port: z.number().default(587),
    user: z.string().email(),
    pass: z.string(),
  }),
  email_to: z.array(z.string().email()).min(1),
  email_template: z.string().default('templates/email.html'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path = 'config.json'): Config {
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));

  // Env vars override sensitive fields — secrets never live in the config file
  if (process.env.GOOGLE_API_KEY) raw.google_api_key = process.env.GOOGLE_API_KEY;
  if (process.env.SMTP_USER)      raw.smtp = { ...raw.smtp, user: process.env.SMTP_USER };
  if (process.env.SMTP_PASS)      raw.smtp = { ...raw.smtp, pass: process.env.SMTP_PASS };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('Invalid configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}
```

---

## Core Modules

### GoogleFetcher

Wraps `@googlemaps/google-maps-services-js`. For each `(category, city)` combination in config, performs a `textSearch` query and maps the response to the internal `Business` model.

**Internal model:**
```typescript
interface Business {
  place_id: string;         // deduplication key — stable and unique per Google Maps entry
  name: string;
  category: string;         // as configured, not Google's own classification
  city: string;
  country: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  maps_url: string;         // https://www.google.com/maps/place/?q=place_id:...
}

interface Metadata {
  key: string;              // see MetadataKey enum
  value: string;
  source?: string;          // 'google' | 'manual' | 'enrichment_api'
  collected_at?: string;    // ISO timestamp
}

interface EnrichedBusiness extends Business {
  metadata: Metadata[];
}
```

### DedupService

Reads and writes `seen_firms.json`. Exposes:
- `filter(businesses: Business[]): Business[]` — returns only businesses not yet seen
- `markSeen(businesses: Business[]): void` — adds businesses to history
- `reset(): void` — clears history (invoked with the `--reset` CLI flag)

### ExcelExporter

Generates a `.xlsx` file with three sheets. Sheet names, column headers, and cell content are all sourced from the active i18n language file. Applies consistent formatting: header row styling, auto-width columns, alternating row colors.

### MailService

Sends the Excel file as an attachment via Nodemailer. Email subject and body are rendered from `templates/email.html` using Handlebars, with run date and result count injected dynamically.

### Scheduler

Wraps `node-cron`. Reads the cron expression from config and schedules the full pipeline: fetch → dedup → export → send email. Logs each execution with timestamp and outcome.

### RestServer

Express server on port `3847`. Exposes:

```
GET  /status    → { lastRun, nextRun, totalSeen, isRunning }
POST /run       → triggers pipeline immediately → { started: true }
GET  /results   → last run results as Business[]
GET  /config    → current config (sensitive fields masked)
PUT  /config    → update config fields (triggers config reload)
```

The server starts automatically in `--daemon` mode. In single-run mode it is not started.

---

## i18n System

All user-facing strings (Excel headers, email content, log messages) are externalized to `src/i18n/{lang}.json` files. The active language is selected from `config.json → language`.

### 10 launch languages

| Code | Language | Notes |
|---|---|---|
| `it` | Italian | Team language — primary reference |
| `en` | English | Lingua franca — default for new users |
| `de` | German | First target market (Onur) |
| `fr` | French | |
| `es` | Spanish | |
| `pt` | Portuguese | Covers Brazil and Portugal |
| `zh` | Chinese (Simplified) | |
| `ja` | Japanese | |
| `ar` | Arabic | RTL — requires attention in Excel layout |
| `hi` | Hindi | 600M+ speakers |

Additional languages will be added in future milestones. With Claude support, the cost of translating a new language file is negligible.

### Language file structure

```json
{
  "excel": {
    "sheet_businesses": "Businesses",
    "col_name": "Company Name",
    "col_category": "Category",
    "col_city": "City",
    "col_address": "Address",
    "col_phone": "Phone",
    "col_website": "Website",
    "col_rating": "Rating",
    "col_reviews": "Reviews",
    "sheet_templates": "Email Templates",
    "sheet_summary": "Run Summary"
  },
  "email": {
    "subject": "SpotCast — New leads for {{date}}",
    "body_intro": "Attached you'll find today's SpotCast results.",
    "body_count": "{{count}} new businesses found."
  },
  "log": {
    "run_start": "RUN STARTED",
    "run_complete": "RUN COMPLETE — {{count}} new businesses | duration: {{duration}}s",
    "run_skipped": "No new businesses found, skipping email",
    "error": "RUN FAILED: {{message}}"
  }
}
```

### Adding a new language

1. Copy `src/i18n/en.json` → `src/i18n/{lang}.json`
2. Translate all values (keep keys identical)
3. Add the language code to the Zod enum in `ConfigLoader.ts`
4. Open a PR

---

## Testing Strategy (Vitest)

| Module | Priority | Type |
|---|---|---|
| `ConfigLoader` | High | Unit — valid/invalid schemas, env var overrides |
| `GoogleFetcher` | High | Unit — mock HTTP client, response → Business mapping |
| `DedupService` | High | Unit — filter/markSeen/reset with temp files |
| `ExcelExporter` | Medium | Unit — generate file, verify sheets and cells with ExcelJS reader |
| `MailService` | Medium | Unit — mock Nodemailer transport, verify payload |
| `RestServer` | Medium | Integration — Supertest on all endpoints |
| Full pipeline | High | Integration — mocked fetcher, verify email sent with valid attachment |

Minimum coverage target: **80%** on all modules.

---

## Release Checklist

- [ ] All tests pass (`npm test`)
- [ ] Coverage ≥ 80% (`npm run test:coverage`)
- [ ] No linting errors (`npm run lint`)
- [ ] `config.example.json` updated if new fields were added
- [ ] `seen_firms.json` and `config.json` present in `.gitignore`
- [ ] `CHANGELOG.md` updated
- [ ] Version bumped in `package.json`
- [ ] User-facing README sections reviewed
