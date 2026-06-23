// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ConfigLoader
//  Loads config.json, validates with Zod, merges env var overrides,
//  resolves category labels to HERE codes via HereCategoryMap (DTR-043).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { HERE_CATEGORY_MAP } from '../fetcher/HereCategoryMap';

// ── Schema ────────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  language: z
    .enum(['it', 'en', 'de', 'fr', 'es', 'pt', 'zh', 'ja', 'ar', 'tr'])
    .default('en'),
  here_api_key:         z.string().min(1, 'here_api_key is required'),
  search_radius_meters: z.number().int().positive().default(15000),
  categories:  z.array(z.string().min(1)).min(1, 'At least one category is required'),
  cities_file: z.string().min(1, 'cities_file is required'),
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

// ── Exported type ─────────────────────────────────────────────────────────────

export type Config = z.infer<typeof ConfigSchema>;

// ── Internal helper ───────────────────────────────────────────────────────────

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

  // Env vars override sensitive fields
  if (process.env.HERE_API_KEY) raw.here_api_key = process.env.HERE_API_KEY;
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

  // ── DTR-043: resolve category labels → HERE codes ─────────────────────────
  const resolvedCategories: string[] = [];
  for (const label of result.data.categories) {
    const code = HERE_CATEGORY_MAP[label];
    if (!code) {
      process.stderr.write(`[ConfigLoader] WARN: unknown category "${label}" — skipping\n`);
    } else {
      resolvedCategories.push(code);
    }
  }
  if (resolvedCategories.length === 0) {
    fatal(
      `No valid categories found in config.json.\n` +
      `Check your category labels against the supported list in src/fetcher/HereCategoryMap.ts.`
    );
  }
  result.data.categories = resolvedCategories;

  return result.data;
}