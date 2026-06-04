// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ConfigLoader tests (Vitest)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// loadConfig is re-imported fresh per test via dynamic import
// to avoid module-level caching issues with process.env

const validConfig = {
  language: 'en',
  google_api_key: 'AIzaSy_test_key',
  categories: ['Dentist', 'Gym'],
  cities: ['Milan'],
  countries: ['Italy'],
  results_per_run: 10,
  schedule: '0 8 * * *',
  output_dir: 'results',
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    user: 'test@test.com',
    pass: 'test_pass',
  },
  email_to: ['dest@test.com'],
  email_template: 'templates/email.html',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeTempConfig(data: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-'));
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
}

function cleanEnv() {
  delete process.env.GOOGLE_API_KEY;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfigLoader', () => {
  beforeEach(() => {
    cleanEnv();
  });

  afterEach(() => {
    cleanEnv();
  });

  // ── Valid config ────────────────────────────────────────────────────────────

  describe('valid configuration', () => {
    it('loads a valid config without errors', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const filePath = writeTempConfig(validConfig);
      const config = loadConfig(filePath);
      expect(config.google_api_key).toBe('AIzaSy_test_key');
    });

    it('returns fully typed Config object', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const filePath = writeTempConfig(validConfig);
      const config = loadConfig(filePath);
      expect(config.language).toBe('en');
      expect(config.categories).toEqual(['Dentist', 'Gym']);
      expect(config.smtp.port).toBe(587);
    });

    it('applies default for results_per_run when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { results_per_run, ...withoutRPR } = validConfig;
      const filePath = writeTempConfig(withoutRPR);
      const config = loadConfig(filePath);
      expect(config.results_per_run).toBe(10);
    });

    it('applies default for language when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { language, ...withoutLang } = validConfig;
      const filePath = writeTempConfig(withoutLang);
      const config = loadConfig(filePath);
      expect(config.language).toBe('en');
    });

    it('applies default for schedule when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { schedule, ...withoutSchedule } = validConfig;
      const filePath = writeTempConfig(withoutSchedule);
      const config = loadConfig(filePath);
      expect(config.schedule).toBe('0 8 * * *');
    });
  });

  // ── Missing required fields ─────────────────────────────────────────────────

  describe('missing required fields', () => {
    it('exits on missing google_api_key', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const { google_api_key, ...withoutKey } = validConfig;
      const filePath = writeTempConfig(withoutKey);
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when categories is empty array', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ ...validConfig, categories: [] });
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when email_to is empty array', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ ...validConfig, email_to: [] });
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when smtp.user is not a valid email', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({
        ...validConfig,
        smtp: { ...validConfig.smtp, user: 'not-an-email' },
      });
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });
  });

  // ── File errors ─────────────────────────────────────────────────────────────

  describe('file errors', () => {
    it('exits when config file does not exist', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      expect(() => loadConfig('/nonexistent/path/config.json')).toThrow();
      mockExit.mockRestore();
    });

    it('exits when config file contains invalid JSON', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-'));
      const filePath = path.join(dir, 'config.json');
      fs.writeFileSync(filePath, '{ this is not valid json }', 'utf-8');
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });
  });

  // ── Env var overrides ───────────────────────────────────────────────────────

  describe('environment variable overrides', () => {
    it('overrides google_api_key with GOOGLE_API_KEY env var', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.GOOGLE_API_KEY = 'env-api-key-override';
      const filePath = writeTempConfig(validConfig);
      const config = loadConfig(filePath);
      expect(config.google_api_key).toBe('env-api-key-override');
    });

    it('overrides smtp.user with SMTP_USER env var', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.SMTP_USER = 'env-user@test.com';
      const filePath = writeTempConfig(validConfig);
      const config = loadConfig(filePath);
      expect(config.smtp.user).toBe('env-user@test.com');
    });

    it('overrides smtp.pass with SMTP_PASS env var', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.SMTP_PASS = 'env-secret-pass';
      const filePath = writeTempConfig(validConfig);
      const config = loadConfig(filePath);
      expect(config.smtp.pass).toBe('env-secret-pass');
    });

    it('env vars take precedence over config file values', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.GOOGLE_API_KEY = 'from-env';
      const filePath = writeTempConfig({ ...validConfig, google_api_key: 'from-file' });
      const config = loadConfig(filePath);
      expect(config.google_api_key).toBe('from-env');
    });
  });
});