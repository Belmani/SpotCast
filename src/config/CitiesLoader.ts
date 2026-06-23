// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — CitiesLoader
//  Loads cities.json, validates with Zod, returns flat array of
//  "city, country" strings ready for GeoCache lookup.
//
//  Input format:
//    [{ "country": "Germany", "cities": ["Berlin", "München"] }, ...]
//
//  Output:
//    ["Berlin, Germany", "München, Germany", ...]
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// ── Schema ────────────────────────────────────────────────────────────────────

const CitiesSchema = z.array(
  z.object({
    country: z.string().min(1, 'country must not be empty'),
    cities:  z.array(z.string().min(1)).min(1, 'cities must contain at least one entry'),
  })
).min(1, 'cities.json must contain at least one country entry');

// ── Internal helper ───────────────────────────────────────────────────────────

function fatal(message: string): never {
  process.stderr.write(`[CitiesLoader] ${message}\n`);
  process.exit(1);
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Loads and validates cities.json.
 * Returns a flat array of "city, country" strings.
 *
 * @param citiesFilePath - Absolute or relative path to cities.json
 */
export function loadCities(citiesFilePath: string): string[] {
  const resolved = path.isAbsolute(citiesFilePath)
    ? citiesFilePath
    : path.resolve(process.cwd(), citiesFilePath);

  if (!fs.existsSync(resolved)) {
    fatal(
      `Cities file not found: ${resolved}\n` +
      `Copy assets/cities/cities.example.json to assets/cities/cities.json and fill in your cities.`
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch (err) {
    fatal(`Failed to parse cities.json: ${(err as Error).message}`);
  }

  const result = CitiesSchema.safeParse(raw);

  if (!result.success) {
    fatal(
      `Invalid cities.json:\n${JSON.stringify(result.error.format(), null, 2)}`
    );
  }

  // Flatten: [{ country, cities[] }] → ["city, country", ...]
  return result.data.flatMap(({ country, cities }) =>
    cities.map(city => `${city}, ${country}`)
  );
}
