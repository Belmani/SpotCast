// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ConfigLoader tests (Vitest)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const validConfig = {
  language:             'en',
  here_api_key:         'test-here-key',
  search_radius_meters: 15000,
  categories:           ['Bar', 'Gym'],
  cities_file:          'assets/cities/cities.json',
  schedule:             '0 8 * * *',
  output_dir:           'results',
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    user: 'test@test.com',
    pass: 'test_pass',
  },
  email_to:       ['dest@test.com'],
  email_template: 'assets/templates/email.html',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeTempConfig(data: object): string {
  const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-config-'));
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
}

function cleanEnv() {
  delete process.env.HERE_API_KEY;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfigLoader', () => {
  beforeEach(() => { cleanEnv(); });
  afterEach(()  => { cleanEnv(); });

  // ── Valid config ────────────────────────────────────────────────────────────

  describe('valid configuration', () => {
    it('loads a valid config without errors', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const config = loadConfig(writeTempConfig(validConfig));
      expect(config.here_api_key).toBe('test-here-key');
    });

    it('returns fully typed Config object', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const config = loadConfig(writeTempConfig(validConfig));
      expect(config.language).toBe('en');
      expect(config.cities_file).toBe('assets/cities/cities.json');
      expect(config.smtp.port).toBe(587);
    });

    it('resolves category labels to HERE codes (DTR-043)', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const config = loadConfig(writeTempConfig(validConfig));
      // "Bar" → "100-1000-0000", "Gym" → "400-4100-0141"
      expect(config.categories).toContain('100-1000-0000');
      expect(config.categories).toContain('400-4100-0141');
      // No raw labels in output
      expect(config.categories).not.toContain('Bar');
      expect(config.categories).not.toContain('Gym');
    });

    it('skips unknown categories with a warning', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const filePath  = writeTempConfig({ ...validConfig, categories: ['Bar', 'UnknownCategory'] });
      const config    = loadConfig(filePath);
      // Bar resolved, UnknownCategory warned + skipped
      expect(config.categories).toEqual(['100-1000-0000']);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('UnknownCategory'));
      stderrSpy.mockRestore();
    });

    it('applies default for search_radius_meters when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { search_radius_meters, ...without } = validConfig;
      expect(loadConfig(writeTempConfig(without)).search_radius_meters).toBe(15000);
    });

    it('applies default for language when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { language, ...without } = validConfig;
      expect(loadConfig(writeTempConfig(without)).language).toBe('en');
    });

    it('applies default for schedule when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { schedule, ...without } = validConfig;
      expect(loadConfig(writeTempConfig(without)).schedule).toBe('0 8 * * *');
    });

    it('applies default for email_template when missing', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const { email_template, ...without } = validConfig;
      expect(loadConfig(writeTempConfig(without)).email_template).toBe('assets/templates/email.html');
    });
  });

  // ── Category validation ─────────────────────────────────────────────────────

  describe('category validation', () => {
    it('exits when all categories are unknown', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit  = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const filePath  = writeTempConfig({ ...validConfig, categories: ['NotACategory', 'AlsoWrong'] });
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
      stderrSpy.mockRestore();
    });
  });

  // ── Missing required fields ─────────────────────────────────────────────────

  describe('missing required fields', () => {
    it('exits on missing here_api_key', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const { here_api_key, ...without } = validConfig;
      expect(() => loadConfig(writeTempConfig(without))).toThrow();
      mockExit.mockRestore();
    });

    it('exits on missing cities_file', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const { cities_file, ...without } = validConfig;
      expect(() => loadConfig(writeTempConfig(without))).toThrow();
      mockExit.mockRestore();
    });

    it('exits when categories is empty array', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      expect(() => loadConfig(writeTempConfig({ ...validConfig, categories: [] }))).toThrow();
      mockExit.mockRestore();
    });

    it('exits when email_to is empty array', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      expect(() => loadConfig(writeTempConfig({ ...validConfig, email_to: [] }))).toThrow();
      mockExit.mockRestore();
    });

    it('exits when smtp.user is not a valid email', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const bad = { ...validConfig, smtp: { ...validConfig.smtp, user: 'not-an-email' } };
      expect(() => loadConfig(writeTempConfig(bad))).toThrow();
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
      const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-config-'));
      const filePath = path.join(dir, 'config.json');
      fs.writeFileSync(filePath, '{ not valid json }', 'utf-8');
      expect(() => loadConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });
  });

  // ── Env var overrides ───────────────────────────────────────────────────────

  describe('environment variable overrides', () => {
    it('overrides here_api_key with HERE_API_KEY env var', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.HERE_API_KEY = 'env-here-key';
      const config = loadConfig(writeTempConfig(validConfig));
      expect(config.here_api_key).toBe('env-here-key');
    });

    it('overrides smtp.user with SMTP_USER env var', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.SMTP_USER = 'env-user@test.com';
      const config = loadConfig(writeTempConfig(validConfig));
      expect(config.smtp.user).toBe('env-user@test.com');
    });

    it('overrides smtp.pass with SMTP_PASS env var', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.SMTP_PASS = 'env-secret-pass';
      const config = loadConfig(writeTempConfig(validConfig));
      expect(config.smtp.pass).toBe('env-secret-pass');
    });

    it('env vars take precedence over config file values', async () => {
      const { loadConfig } = await import('../../src/config/ConfigLoader');
      process.env.HERE_API_KEY = 'from-env';
      const config = loadConfig(writeTempConfig({ ...validConfig, here_api_key: 'from-file' }));
      expect(config.here_api_key).toBe('from-env');
    });
  });
});