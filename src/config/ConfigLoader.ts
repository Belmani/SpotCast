// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ConfigLoader
//  Loads config.json, validates with Zod, merges env var overrides
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// ── Schema ────────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  language: z
    .enum(['it', 'en', 'de', 'fr', 'es', 'pt', 'zh', 'ja', 'ar', 'tr'])
    .default('en'),
  here_api_key:         z.string().min(1, 'here_api_key is required'),
  search_radius_meters: z.number().int().positive().default(15000),
  categories:  z.array(z.string()).min(1, 'At least one category is required'),
  cities:      z.array(z.string()).min(1, 'At least one city is required'),
  countries:   z.array(z.string()).min(1, 'At least one country is required'),
  schedule:    z.string().default('0 8 * * *'),
  output_dir:  z.string().default('results'),
  smtp: z.object({
    host: z.string().min(1, 'smtp.host is required'),
    port: z.number().default(587),
    user: z.string().email('smtp.user must be a valid email'),
    pass: z.string().min(1, 'smtp.pass is required'),
  }),
  email_to: z
    .array(z.string().email())
    .min(1, 'At least one recipient in email_to is required'),
  email_template: z.string().default('assets/templates/email.html'),
});

// ── Exported type — inferred automatically from schema ────────────────────────

export type Config = z.infer<typeof ConfigSchema>;

// ── Internal helper — stderr only, no winston dependency at this stage ────────

function fatal(message: string): never {
  process.stderr.write(`[ConfigLoader] ${message}\n`);
  process.exit(1);
}

// ── Loader ────────────────────────────────────────────────────────────────────

export function loadConfig(configPath = 'config.json'): Config {
  const resolved = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolved)) {
    fatal(
      `Config file not found: ${resolved}\n` +
      `Copy config.example.json to config.json and fill in your values.`
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Record<string, unknown>;
  } catch (err) {
    fatal(`Failed to parse config.json: ${(err as Error).message}`);
  }

  // Warn and ignore legacy fields
  if ('google_api_key' in raw) {
    process.stderr.write('[ConfigLoader] WARN: google_api_key is no longer used — replace with here_api_key\n');
    delete raw.google_api_key;
  }
  if ('results_per_run' in raw) {
    process.stderr.write('[ConfigLoader] WARN: results_per_run is no longer used and will be ignored\n');
    delete raw.results_per_run;
  }

  // Env vars override sensitive fields — secrets never live in the config file
  if (process.env.HERE_API_KEY) {
    raw.here_api_key = process.env.HERE_API_KEY;
  }
  if (process.env.SMTP_USER || process.env.SMTP_PASS) {
    const smtp = (raw.smtp ?? {}) as Record<string, unknown>;
    if (process.env.SMTP_USER) smtp.user = process.env.SMTP_USER;
    if (process.env.SMTP_PASS) smtp.pass = process.env.SMTP_PASS;
    raw.smtp = smtp;
  }

  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    fatal(
      `Invalid configuration:\n${JSON.stringify(result.error.format(), null, 2)}`
    );
  }

  return result.data;
}