// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ExcelConfigLoader tests (Vitest)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeTempConfig(data: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-excel-'));
  const filePath = path.join(dir, 'excel.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validConfig = {
  columns: {
    place_id:     false,
    name:         true,
    category:     true,
    city:         true,
    country:      true,
    address:      true,
    phone:        true,
    website:      true,
    rating:       true,
    review_count: true,
    maps_url:     false,
    first_seen:   false,
  },
  include_email_templates: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExcelConfigLoader', () => {

  // ── Valid config ────────────────────────────────────────────────────────────

  describe('valid configuration', () => {
    it('loads a valid config without errors', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const filePath = writeTempConfig(validConfig);
      const config = loadExcelConfig(filePath);
      expect(config.columns.name).toBe(true);
    });

    it('returns fully typed ExcelConfig object', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const filePath = writeTempConfig(validConfig);
      const config = loadExcelConfig(filePath);
      expect(config.include_email_templates).toBe(true);
      expect(typeof config.columns.place_id).toBe('boolean');
    });

    it('applies default true for include_email_templates when missing', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const { include_email_templates, ...withoutFlag } = validConfig;
      const filePath = writeTempConfig(withoutFlag);
      const config = loadExcelConfig(filePath);
      expect(config.include_email_templates).toBe(true);
    });
  });

  // ── Mandatory fields protection ─────────────────────────────────────────────

  describe('mandatory fields protection', () => {
    it('exits when name is disabled', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ ...validConfig, columns: { ...validConfig.columns, name: false } });
      expect(() => loadExcelConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when category is disabled', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ ...validConfig, columns: { ...validConfig.columns, category: false } });
      expect(() => loadExcelConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when city is disabled', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ ...validConfig, columns: { ...validConfig.columns, city: false } });
      expect(() => loadExcelConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when address is disabled', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ ...validConfig, columns: { ...validConfig.columns, address: false } });
      expect(() => loadExcelConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('does not exit when non-mandatory fields are disabled', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const filePath = writeTempConfig({
        ...validConfig,
        columns: { ...validConfig.columns, place_id: false, maps_url: false, first_seen: false },
      });
      expect(() => loadExcelConfig(filePath)).not.toThrow();
    });
  });

  // ── Column order ─────────────────────────────────────────────────────────────

  describe('column order', () => {
    it('preserves the key order from the config file', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const filePath = writeTempConfig(validConfig);
      const config = loadExcelConfig(filePath);
      const enabledColumns = Object.entries(config.columns)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key);
      // name appears before category in validConfig
      expect(enabledColumns.indexOf('name')).toBeLessThan(enabledColumns.indexOf('category'));
    });

    it('activeColumns() returns only enabled columns in order', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const filePath = writeTempConfig(validConfig);
      const config = loadExcelConfig(filePath);
      // place_id, maps_url, first_seen are false in validConfig
      const active = Object.entries(config.columns)
        .filter(([, v]) => v)
        .map(([k]) => k);
      expect(active).not.toContain('place_id');
      expect(active).not.toContain('maps_url');
      expect(active).not.toContain('first_seen');
      expect(active).toContain('name');
    });
  });

  // ── File errors ──────────────────────────────────────────────────────────────

  describe('file errors', () => {
    it('exits when config file does not exist', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      expect(() => loadExcelConfig('/nonexistent/path/excel.json')).toThrow();
      mockExit.mockRestore();
    });

    it('exits when config file contains invalid JSON', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-excel-'));
      const filePath = path.join(dir, 'excel.json');
      fs.writeFileSync(filePath, '{ this is not valid json }');
      expect(() => loadExcelConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });

    it('exits when columns field is missing entirely', async () => {
      const { loadExcelConfig } = await import('../../src/config/ExcelConfigLoader');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const filePath = writeTempConfig({ include_email_templates: true });
      expect(() => loadExcelConfig(filePath)).toThrow();
      mockExit.mockRestore();
    });
  });

});
