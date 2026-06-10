// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ExcelConfigLoader
//  Loads excel.json, validates with Zod, protects mandatory columns.
//
//  Mandatory columns (cannot be disabled — DTR-025):
//    name, category, city, address
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// ── Schema ────────────────────────────────────────────────────────────────────

const ColumnsSchema = z.object({
  place_id:     z.boolean().default(false),
  name:         z.boolean().default(true),
  category:     z.boolean().default(true),
  city:         z.boolean().default(true),
  country:      z.boolean().default(true),
  address:      z.boolean().default(true),
  phone:        z.boolean().default(true),
  website:      z.boolean().default(true),
  rating:       z.boolean().default(true),
  review_count: z.boolean().default(true),
  maps_url:     z.boolean().default(false),
  first_seen:   z.boolean().default(false),
});

const ExcelConfigSchema = z.object({
  columns:                 ColumnsSchema,
  include_email_templates: z.boolean().default(true),
});

// ── Exported types ────────────────────────────────────────────────────────────

export type ExcelConfig = z.infer<typeof ExcelConfigSchema>;

// ── Mandatory columns — cannot be disabled ────────────────────────────────────

const MANDATORY_COLUMNS: Array<keyof z.infer<typeof ColumnsSchema>> = [
  'name',
  'category',
  'city',
  'address',
];

// ── Internal helper ───────────────────────────────────────────────────────────

function fatal(message: string): never {
  process.stderr.write(`[ExcelConfigLoader] ${message}\n`);
  process.exit(1);
}

// ── Loader ────────────────────────────────────────────────────────────────────

export function loadExcelConfig(configPath = 'excel.json'): ExcelConfig {
  const resolved = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolved)) {
    fatal(
      `Excel config file not found: ${resolved}\n` +
      `Copy excel.example.json to excel.json.`
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Record<string, unknown>;
  } catch (err) {
    fatal(`Failed to parse excel.json: ${(err as Error).message}`);
  }

  const result = ExcelConfigSchema.safeParse(raw);

  if (!result.success) {
    fatal(
      `Invalid excel.json configuration:\n${JSON.stringify(result.error.format(), null, 2)}`
    );
  }

  // Mandatory columns protection (DTR-025)
  for (const col of MANDATORY_COLUMNS) {
    if (!result.data.columns[col]) {
      fatal(
        `Column "${col}" is mandatory and cannot be disabled in excel.json.\n` +
        `Mandatory columns: ${MANDATORY_COLUMNS.join(', ')}.`
      );
    }
  }

  return result.data;
}
