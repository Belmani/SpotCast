// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — Main Pipeline
//  Orchestrates the full discovery → dedup → export → mail flow.
//
//  CLI modes:
//    node SpotCast.js                  single run, exits when done
//    node SpotCast.js --daemon         stays alive, runs on cron schedule
//    node SpotCast.js --daemon --now   daemon + immediate first run
//
//  Error handling (DTR-037):
//    single run  → logs error, process.exit(1)
//    daemon      → logs error, stays alive for next scheduled run
// ─────────────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { loadConfig } from './config/ConfigLoader';
import { loadExcelConfig } from './config/ExcelConfigLoader';
import { GoogleFetcher } from './fetcher/GoogleFetcher';
import { DedupService } from './dedup/DedupService';
import { ExcelExporter } from './excel/ExcelExporter';
import { MailService } from './mailer/MailService';
import logger from './logger';

// ── i18n loader ───────────────────────────────────────────────────────────────

function loadI18n(lang: string): Record<string, string> {
  const filePath = path.resolve(process.cwd(), `assets/i18n/${lang}.json`);
  if (!fs.existsSync(filePath)) {
    logger.warn(`i18n file not found for language "${lang}", falling back to "en"`);
    return loadI18n('en');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, string>;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runPipeline(options: {
  useJsonTransport?: boolean;
} = {}): Promise<{
  found: number;
  skipped: boolean;
}> {
  const config      = loadConfig();
  const excelConfig = loadExcelConfig();
  const i18n        = loadI18n(config.language);
  const fallback    = loadI18n('en');

  logger.info('SpotCast run started');

  // ── Step 1: Fetch ──────────────────────────────────────────────────────────
  const fetcher  = new GoogleFetcher(config);
  const fetched  = await fetcher.fetchAll();
  logger.info(`Fetched ${fetched.length} businesses from Google Places`);

  // ── Step 2: Dedup ──────────────────────────────────────────────────────────
  const dedup            = new DedupService();
  const fresh            = dedup.filter(fetched);
  const duplicatesSkipped = fetched.length - fresh.length;
  logger.info(`After dedup: ${fresh.length} new businesses (${duplicatesSkipped} duplicates skipped)`);

  // ── Step 3: Skip if nothing new ───────────────────────────────────────────
  if (fresh.length === 0) {
    logger.info('Run completed — 0 new businesses found, email skipped');
    return { found: 0, skipped: true };
  }

  // ── Step 4: Export Excel ───────────────────────────────────────────────────
  const exporter      = new ExcelExporter(config, excelConfig);
  const excelFilePath = await exporter.export(fresh, duplicatesSkipped, i18n, fallback);
  logger.info(`Excel exported: ${excelFilePath}`);

  // ── Step 5: Send email ────────────────────────────────────────────────────
  const mailer = new MailService(config, {
    useJsonTransport: options.useJsonTransport,
  });
  await mailer.send(excelFilePath, fresh, i18n, fallback);

  // ── Step 6: Mark seen ─────────────────────────────────────────────────────
  dedup.markSeen(fresh);

  // ── Step 7: Summary log ───────────────────────────────────────────────────
  logger.info(
    `Run completed — ${fresh.length} new businesses found, email sent to ${config.email_to.length} recipient(s)`
  );

  return { found: fresh.length, skipped: false };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isDaemon = process.argv.includes('--daemon');
  const runNow   = process.argv.includes('--now');

  if (!isDaemon) {
    // ── Single run mode ──────────────────────────────────────────────────────
    try {
      await runPipeline();
      process.exit(0);
    } catch (err) {
      logger.error(`Run failed — ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  // ── Daemon mode ─────────────────────────────────────────────────────────────
  const config = loadConfig();
  logger.info(`SpotCast daemon started — schedule: "${config.schedule}"`);

  // Immediate run if --now is passed
  if (runNow) {
    logger.info('--now flag detected, executing immediate run');
    try {
      await runPipeline();
    } catch (err) {
      logger.error(`Immediate run failed — ${(err as Error).message}`);
      // Do not exit — stay alive for scheduled runs
    }
  }

  // Register cron job
  cron.schedule(config.schedule, async () => {
    try {
      await runPipeline();
    } catch (err) {
      logger.error(`Scheduled run failed — ${(err as Error).message}`);
      // Do not exit — daemon stays alive
    }
  });
}

// Only execute main when run directly, not when imported in tests
if (require.main === module) {
  main();
}