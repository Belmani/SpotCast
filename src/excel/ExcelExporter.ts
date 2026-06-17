// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — ExcelExporter
//  Generates a .xlsx file with three sheets from filtered business results.
//
//  Sheet 1 — Businesses      : one row per business, columns from excel.json
//  Sheet 2 — Email Templates : optional, one pre-filled email per business
//  Sheet 3 — Run Summary     : date, counts, source, language
//
//  i18n strings come from translate.ts — no hardcoded visible text.
//  Column layout is driven by excel.json — no hardcoded column list.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { Business } from '../fetcher/Business';
import { Config } from '../config/ConfigLoader';
import { ExcelConfig } from '../config/ExcelConfigLoader';
import { t } from '../i18n/translate';
import logger from '../logger';

// ── Styling constants ─────────────────────────────────────────────────────────

const HEADER_BG     = 'FF2E75B6';
const HEADER_FG     = 'FFFFFFFF';
const ALT_ROW_BG    = 'FFEBF3FB';
const MIN_COL_WIDTH = 10;
const COL_PADDING   = 2;

// ── Column key → Business field mapping ──────────────────────────────────────

type BusinessKey = keyof Business;

const COL_TO_FIELD: Record<string, BusinessKey> = {
  place_id:     'place_id',
  name:         'name',
  category:     'category',
  city:         'city',
  country:      'country',
  address:      'address',
  phone:        'phone',
  website:      'website',
  rating:       'rating',
  review_count: 'review_count',
  maps_url:     'maps_url',
  first_seen:   'first_seen',
};

const COL_TO_I18N_KEY: Record<string, string> = {
  place_id:     'col_place_id',
  name:         'col_name',
  category:     'col_category',
  city:         'col_city',
  country:      'col_country',
  address:      'col_address',
  phone:        'col_phone',
  website:      'col_website',
  rating:       'col_rating',
  review_count: 'col_review_count',
  maps_url:     'col_maps_url',
  first_seen:   'col_first_seen',
};

// ── ExcelExporter ─────────────────────────────────────────────────────────────

export class ExcelExporter {
  constructor(
    private config: Config,
    private excelConfig: ExcelConfig
  ) {}

  /**
   * Generates the .xlsx file and returns its absolute path.
   *
   * @param businesses        - Filtered businesses to export
   * @param duplicatesSkipped - Count of duplicates filtered by DedupService
   * @param i18n              - Active language dictionary
   * @param fallback          - en.json — always passed as safety net
   */
  async export(
    businesses: Business[],
    duplicatesSkipped: number,
    i18n: Record<string, unknown>,
    fallback: Record<string, unknown>
  ): Promise<string> {
    const tr = (key: string) => t(key, i18n, fallback);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SpotCast';
    workbook.created = new Date();

    this.buildSheet1(workbook, businesses, tr);

    if (this.excelConfig.include_email_templates) {
      this.buildSheet2(workbook, businesses, tr);
    }

    this.buildSheet3(workbook, businesses.length, duplicatesSkipped, tr);

    return this.save(workbook);
  }

  // ── Sheet 1 — Businesses ───────────────────────────────────────────────────

  private buildSheet1(
    workbook: ExcelJS.Workbook,
    businesses: Business[],
    tr: (key: string) => string
  ): void {
    const sheet = workbook.addWorksheet(tr('sheet_businesses'));

    const activeCols = Object.entries(this.excelConfig.columns)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    sheet.columns = activeCols.map(colKey => ({
      key:   colKey,
      width: MIN_COL_WIDTH,
    }));

    const headerValues = activeCols.map(colKey => tr(COL_TO_I18N_KEY[colKey] ?? colKey));
    const headerRow = sheet.addRow(headerValues);
    this.styleHeaderRow(headerRow, activeCols.length);

    businesses.forEach((business, index) => {
      const rowValues = activeCols.map(colKey => {
        const field = COL_TO_FIELD[colKey];
        return field ? (business[field] ?? '') : '';
      });
      const row = sheet.addRow(rowValues);

      if (index % 2 === 1) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } };
        });
      }
    });

    sheet.columns.forEach((col, colIndex) => {
      const headerLen = headerValues[colIndex]?.length ?? 0;
      const maxDataLen = businesses.reduce((max, business) => {
        const field = COL_TO_FIELD[activeCols[colIndex]];
        const val = field ? String(business[field] ?? '') : '';
        return Math.max(max, val.length);
      }, 0);
      col.width = Math.max(MIN_COL_WIDTH, headerLen, maxDataLen) + COL_PADDING;
    });
  }

  // ── Sheet 2 — Email Templates ──────────────────────────────────────────────

  private buildSheet2(
    workbook: ExcelJS.Workbook,
    businesses: Business[],
    tr: (key: string) => string
  ): void {
    const sheet = workbook.addWorksheet(tr('sheet_email_templates'));

    const subjectTemplate = Handlebars.compile(tr('email_subject_template'));
    const bodyTemplate    = Handlebars.compile(tr('email_body_template'));

    const headers = [
      tr('col_name'), tr('col_category'), tr('col_city'),
      tr('col_email_subject'), tr('col_email_body'),
    ];

    sheet.columns = [
      { key: 'name',          width: 30 },
      { key: 'category',      width: 18 },
      { key: 'city',          width: 16 },
      { key: 'email_subject', width: 40 },
      { key: 'email_body',    width: 60 },
    ];

    const headerRow = sheet.addRow(headers);
    this.styleHeaderRow(headerRow, headers.length);

    businesses.forEach((business, index) => {
      const row = sheet.addRow([
        business.name, business.category, business.city,
        subjectTemplate(business), bodyTemplate(business),
      ]);

      row.getCell(5).alignment = { wrapText: true, vertical: 'top' };

      if (index % 2 === 1) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } };
        });
      }
    });
  }

  // ── Sheet 3 — Run Summary ──────────────────────────────────────────────────

  private buildSheet3(
    workbook: ExcelJS.Workbook,
    totalFound: number,
    duplicatesSkipped: number,
    tr: (key: string) => string
  ): void {
    const sheet = workbook.addWorksheet(tr('sheet_run_summary'));

    sheet.columns = [
      { key: 'label', width: 28 },
      { key: 'value', width: 20 },
    ];

    const runDate = new Date().toISOString().split('T')[0];

    const rows: [string, string | number][] = [
      [tr('summary_run_date'),    runDate],
      [tr('summary_total_found'), totalFound],
      [tr('summary_duplicates'),  duplicatesSkipped],
      [tr('summary_data_source'), 'here'],
      [tr('summary_language'),    this.config.language],
    ];

    rows.forEach(([label, value]) => sheet.addRow([label, value]));

    sheet.getColumn('label').eachCell(cell => {
      cell.font = { bold: true };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
    row.font      = { bold: true, color: { argb: HEADER_FG } };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.height    = 20;

    for (let i = 1; i <= colCount; i++) {
      row.getCell(i).fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG },
      };
    }
  }

  private async save(workbook: ExcelJS.Workbook): Promise<string> {
    const outputDir = path.isAbsolute(this.config.output_dir)
      ? this.config.output_dir
      : path.resolve(process.cwd(), this.config.output_dir);

    fs.mkdirSync(outputDir, { recursive: true });

    const date     = new Date().toISOString().split('T')[0];
    const filename = `SpotCast_${date}.xlsx`;
    const filePath = path.join(outputDir, filename);

    await workbook.xlsx.writeFile(filePath);
    logger.info(`Excel file generated: ${filePath}`);

    return filePath;
  }
}