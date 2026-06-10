// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ExcelExporter tests (Vitest)
//
//  Strategy: real .xlsx files in os.tmpdir() — no ExcelJS mocking.
//  Rationale: mocking ExcelJS hides real serialisation bugs.
//  Each test group gets an isolated output directory.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import ExcelJS from "exceljs";
import { ExcelExporter } from "../../src/excel/ExcelExporter";
import { Business } from "../../src/fetcher/Business";
import { Config } from "../../src/config/ConfigLoader";
import { ExcelConfig } from "../../src/config/ExcelConfigLoader";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const en = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../assets/i18n/en.json"), "utf-8")
) as Record<string, string>;

const mockConfig: Config = {
  language: "en",
  google_api_key: "test-key",
  categories: ["Dentist"],
  cities: ["Milan"],
  countries: ["Italy"],
  results_per_run: 10,
  schedule: "0 8 * * *",
  output_dir: "", // overridden per-test via tmpDir
  smtp: {
    host: "smtp.test.com",
    port: 587,
    user: "test@test.com",
    pass: "pass",
  },
  email_to: ["dest@test.com"],
  email_template: "templates/email.html",
};

const defaultExcelConfig: ExcelConfig = {
  columns: {
    place_id: false,
    name: true,
    category: true,
    city: true,
    country: true,
    address: true,
    phone: true,
    website: true,
    rating: true,
    review_count: true,
    maps_url: false,
    first_seen: false,
  },
  include_email_templates: true,
};

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    place_id: "ChIJ_test_001",
    name: "Studio Dentistico Rossi",
    category: "Dentist",
    city: "Milan",
    country: "Italy",
    address: "Via Roma 1, 20100 Milan",
    phone: "+39 02 12345678",
    website: "https://www.rossi-dental.it",
    rating: 4.5,
    review_count: 120,
    maps_url: "https://www.google.com/maps/place/?q=place_id:ChIJ_test_001",
    first_seen: "2026-06-10T08:00:00.000Z",
    ...overrides,
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spotcast-excel-"));
}

async function generateAndRead(
  businesses: Business[],
  duplicatesSkipped: number,
  excelConfig: ExcelConfig = defaultExcelConfig,
  i18n: Record<string, string> = en
): Promise<{ filePath: string; workbook: ExcelJS.Workbook }> {
  const dir = tmpDir();
  const config = { ...mockConfig, output_dir: dir };
  const exporter = new ExcelExporter(config, excelConfig);
  const filePath = await exporter.export(
    businesses,
    duplicatesSkipped,
    i18n,
    en
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return { filePath, workbook };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ExcelExporter", () => {
  // ── File generation ──────────────────────────────────────────────────────────

  describe("file generation", () => {
    it("generates a .xlsx file in the output directory", async () => {
      const { filePath } = await generateAndRead([makeBusiness()], 0);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/SpotCast_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it("returns the absolute path of the generated file", async () => {
      const { filePath } = await generateAndRead([makeBusiness()], 0);
      expect(path.isAbsolute(filePath)).toBe(true);
    });

    it("creates the output directory automatically if it does not exist", async () => {
      const dir = path.join(tmpDir(), "nested", "output");
      const config = { ...mockConfig, output_dir: dir };
      const exporter = new ExcelExporter(config, defaultExcelConfig);
      await exporter.export([makeBusiness()], 0, en, en);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it("does not crash on empty businesses array", async () => {
      await expect(generateAndRead([], 0)).resolves.toBeDefined();
    });
  });

  // ── Sheet structure ──────────────────────────────────────────────────────────

  describe("sheet structure", () => {
    it("generates exactly 3 sheets when email templates are enabled", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      expect(workbook.worksheets).toHaveLength(3);
    });

    it("generates exactly 2 sheets when email templates are disabled", async () => {
      const config = { ...defaultExcelConfig, include_email_templates: false };
      const { workbook } = await generateAndRead([makeBusiness()], 0, config);
      expect(workbook.worksheets).toHaveLength(2);
    });

    it("Sheet 1 name comes from i18n sheet_businesses key", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      expect(workbook.worksheets[0].name).toBe(en["sheet_businesses"]);
    });

    it("Sheet 2 name comes from i18n sheet_email_templates key", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      expect(workbook.worksheets[1].name).toBe(en["sheet_email_templates"]);
    });

    it("Sheet 3 name comes from i18n sheet_run_summary key", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      expect(workbook.worksheets[2].name).toBe(en["sheet_run_summary"]);
    });
  });

  // ── Sheet 1 — Businesses ─────────────────────────────────────────────────────

  describe("Sheet 1 — Businesses", () => {
    it("header row contains all enabled column labels", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[0];
      const headerRow = sheet.getRow(1).values as string[];
      expect(headerRow).toContain(en["col_name"]);
      expect(headerRow).toContain(en["col_category"]);
      expect(headerRow).toContain(en["col_city"]);
      expect(headerRow).toContain(en["col_address"]);
    });

    it("disabled columns are absent from the header", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[0];
      const headerRow = sheet.getRow(1).values as string[];
      // place_id and maps_url are false in defaultExcelConfig
      expect(headerRow).not.toContain(en["col_place_id"]);
      expect(headerRow).not.toContain(en["col_maps_url"]);
    });

    it("data row contains the correct business name", async () => {
      const business = makeBusiness({ name: "Test Business SRL" });
      const { workbook } = await generateAndRead([business], 0);
      const sheet = workbook.worksheets[0];
      const headerRow = sheet.getRow(1).values as string[];
      const nameColIndex = headerRow.indexOf(en["col_name"]);
      const dataRow = sheet.getRow(2).values as string[];
      expect(dataRow[nameColIndex]).toBe("Test Business SRL");
    });

    it("data row contains the correct city", async () => {
      const business = makeBusiness({ city: "Rome" });
      const { workbook } = await generateAndRead([business], 0);
      const sheet = workbook.worksheets[0];
      const headerRow = sheet.getRow(1).values as string[];
      const cityColIndex = headerRow.indexOf(en["col_city"]);
      const dataRow = sheet.getRow(2).values as string[];
      expect(dataRow[cityColIndex]).toBe("Rome");
    });

    it("generates one data row per business", async () => {
      const businesses = [
        makeBusiness(),
        makeBusiness({ place_id: "ChIJ_002", name: "Gym Milano" }),
      ];
      const { workbook } = await generateAndRead(businesses, 0);
      const sheet = workbook.worksheets[0];
      // row 1 = header, rows 2..n = data
      expect(sheet.rowCount).toBe(businesses.length + 1);
    });

    it("empty businesses array produces only the header row", async () => {
      const { workbook } = await generateAndRead([], 0);
      const sheet = workbook.worksheets[0];
      expect(sheet.rowCount).toBe(1);
    });

    it("column order respects excel.json key order", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[0];
      const headerRow = (sheet.getRow(1).values as string[]).filter(Boolean);
      const nameIdx = headerRow.indexOf(en["col_name"]);
      const categoryIdx = headerRow.indexOf(en["col_category"]);
      const cityIdx = headerRow.indexOf(en["col_city"]);
      // name → category → city in defaultExcelConfig
      expect(nameIdx).toBeLessThan(categoryIdx);
      expect(categoryIdx).toBeLessThan(cityIdx);
    });

    it("header row has bold font", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[0];
      const firstCell = sheet.getRow(1).getCell(1);
      expect(firstCell.font?.bold).toBe(true);
    });

    it("header row has the correct background color", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[0];
      const firstCell = sheet.getRow(1).getCell(1);
      const fill = firstCell.fill as ExcelJS.FillPattern;
      expect(fill?.fgColor?.argb?.toUpperCase()).toContain("2E75B6");
    });

    it("all column widths are greater than zero", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[0];
      sheet.columns.forEach((col) => {
        expect(col.width ?? 0).toBeGreaterThan(0);
      });
    });
  });

  // ── Sheet 2 — Email Templates ─────────────────────────────────────────────

  describe("Sheet 2 — Email Templates", () => {
    it("subject cell contains the business name", async () => {
      const business = makeBusiness({ name: "Studio Bianchi" });
      const { workbook } = await generateAndRead([business], 0);
      const sheet = workbook.worksheets[1];
      const headerRow = sheet.getRow(1).values as string[];
      const subjectIdx = headerRow.indexOf(en["col_email_subject"]);
      const dataRow = sheet.getRow(2).values as string[];
      expect(String(dataRow[subjectIdx])).toContain("Studio Bianchi");
    });

    it("body cell contains the business city", async () => {
      const business = makeBusiness({ city: "Turin" });
      const { workbook } = await generateAndRead([business], 0);
      const sheet = workbook.worksheets[1];
      const headerRow = sheet.getRow(1).values as string[];
      const bodyIdx = headerRow.indexOf(en["col_email_body"]);
      const dataRow = sheet.getRow(2).values as string[];
      expect(String(dataRow[bodyIdx])).toContain("Turin");
    });

    it("body column has wrapText enabled", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[1];
      const headerRow = sheet.getRow(1).values as string[];
      const bodyIdx = headerRow.indexOf(en["col_email_body"]);
      const bodyCell = sheet.getRow(2).getCell(bodyIdx);
      expect(bodyCell.alignment?.wrapText).toBe(true);
    });

    it("context columns name, category, city are present", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[1];
      const headerRow = sheet.getRow(1).values as string[];
      expect(headerRow).toContain(en["col_name"]);
      expect(headerRow).toContain(en["col_category"]);
      expect(headerRow).toContain(en["col_city"]);
    });

    it("is absent when include_email_templates is false", async () => {
      const config = { ...defaultExcelConfig, include_email_templates: false };
      const { workbook } = await generateAndRead([makeBusiness()], 0, config);
      const sheetNames = workbook.worksheets.map((s) => s.name);
      expect(sheetNames).not.toContain(en["sheet_email_templates"]);
    });
  });

  // ── Sheet 3 — Run Summary ─────────────────────────────────────────────────

  describe("Sheet 3 — Run Summary", () => {
    it("run_date is in YYYY-MM-DD format", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[2];
      const rows = sheet.getSheetValues() as string[][];
      const flat = rows.flat().filter(Boolean).map(String);
      const dateEntry = flat.find((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
      expect(dateEntry).toBeDefined();
    });

    it("total_found matches the businesses array length", async () => {
      const businesses = [
        makeBusiness(),
        makeBusiness({ place_id: "ChIJ_002", name: "Gym" }),
      ];
      const { workbook } = await generateAndRead(businesses, 3);
      const sheet = workbook.worksheets[2];
      const rows = sheet.getSheetValues() as (string | number)[][];
      const flat = rows.flat().filter((v) => v !== null && v !== undefined);
      expect(flat).toContain(2); // total_found
    });

    it("duplicates_skipped matches the parameter passed", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 7);
      const sheet = workbook.worksheets[2];
      const rows = sheet.getSheetValues() as (string | number)[][];
      const flat = rows.flat().filter((v) => v !== null && v !== undefined);
      expect(flat).toContain(7);
    });

    it('data_source is "google"', async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[2];
      const rows = sheet.getSheetValues() as string[][];
      const flat = rows.flat().filter(Boolean).map(String);
      expect(flat).toContain("google");
    });

    it("row labels come from i18n keys", async () => {
      const { workbook } = await generateAndRead([makeBusiness()], 0);
      const sheet = workbook.worksheets[2];
      const rows = sheet.getSheetValues() as string[][];
      const flat = rows.flat().filter(Boolean).map(String);
      expect(flat).toContain(en["summary_run_date"]);
      expect(flat).toContain(en["summary_total_found"]);
      expect(flat).toContain(en["summary_duplicates"]);
      expect(flat).toContain(en["summary_data_source"]);
      expect(flat).toContain(en["summary_language"]);
    });
  });

  // ── i18n fallback ─────────────────────────────────────────────────────────

  describe("i18n fallback", () => {
    it("uses fallback (en) value when active dict is missing a key", async () => {
      // Active dict with no sheet_businesses key — should fall back to en
      const { workbook } = await generateAndRead(
        [makeBusiness()],
        0,
        defaultExcelConfig,
        {}
      );
      expect(workbook.worksheets[0].name).toBe(en["sheet_businesses"]);
    });
  });
});
