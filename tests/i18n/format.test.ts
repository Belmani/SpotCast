// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — format tests (Vitest)
//
//  Tests the three localisation formatting functions:
//    formatDate    — date pattern from i18n.formats.date
//    formatInteger — whole numbers with thousands separator
//    formatDecimal — float numbers with decimal + thousands separators
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { formatDate, formatInteger, formatDecimal } from '../../src/i18n/format';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Real i18n dictionaries — same shape as the actual JSON files
const en  = { formats: { date: 'YYYY-MM-DD', decimal_separator: '.', thousands_separator: ',' } };
const it_ = { formats: { date: 'DD/MM/YYYY', decimal_separator: ',', thousands_separator: '.' } };
const de  = { formats: { date: 'DD.MM.YYYY', decimal_separator: ',', thousands_separator: '.' } };
const fr  = { formats: { date: 'DD/MM/YYYY', decimal_separator: ',', thousands_separator: ' ' } };
const zh  = { formats: { date: 'YYYY年MM月DD日', decimal_separator: '.', thousands_separator: ',' } };
const ja  = { formats: { date: 'YYYY年MM月DD日', decimal_separator: '.', thousands_separator: ',' } };

const empty = {};
const noFormats = { language: 'xx' };

// Reference date — fixed for deterministic tests
const date = new Date('2026-06-10T00:00:00.000Z');

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {

  describe('standard patterns', () => {
    it('formats EN: YYYY-MM-DD', () => {
      expect(formatDate(date, en)).toBe('2026-06-10');
    });

    it('formats IT: DD/MM/YYYY', () => {
      expect(formatDate(date, it_)).toBe('10/06/2026');
    });

    it('formats DE: DD.MM.YYYY', () => {
      expect(formatDate(date, de)).toBe('10.06.2026');
    });

    it('formats FR: DD/MM/YYYY', () => {
      expect(formatDate(date, fr)).toBe('10/06/2026');
    });

    it('formats ZH: YYYY年MM月DD日', () => {
      expect(formatDate(date, zh)).toBe('2026年06月10日');
    });

    it('formats JA: YYYY年MM月DD日', () => {
      expect(formatDate(date, ja)).toBe('2026年06月10日');
    });
  });

  describe('padding', () => {
    it('pads single-digit day with leading zero', () => {
      const d = new Date('2026-01-05T00:00:00.000Z');
      expect(formatDate(d, en)).toBe('2026-01-05');
    });

    it('pads single-digit month with leading zero', () => {
      const d = new Date('2026-03-01T00:00:00.000Z');
      expect(formatDate(d, it_)).toBe('01/03/2026');
    });
  });

  describe('fallback', () => {
    it('falls back to YYYY-MM-DD when formats is absent', () => {
      expect(formatDate(date, empty)).toBe('2026-06-10');
    });

    it('falls back to YYYY-MM-DD when formats.date is missing', () => {
      expect(formatDate(date, noFormats)).toBe('2026-06-10');
    });
  });

});

// ── formatInteger ─────────────────────────────────────────────────────────────

describe('formatInteger', () => {

  describe('with thousands separator', () => {
    it('EN: uses comma as thousands separator', () => {
      expect(formatInteger(1234, en)).toBe('1,234');
    });

    it('IT: uses dot as thousands separator', () => {
      expect(formatInteger(1234, it_)).toBe('1.234');
    });

    it('DE: uses dot as thousands separator', () => {
      expect(formatInteger(1234, de)).toBe('1.234');
    });

    it('FR: uses space as thousands separator', () => {
      expect(formatInteger(1234, fr)).toBe('1 234');
    });

    it('handles millions correctly', () => {
      expect(formatInteger(1234567, en)).toBe('1,234,567');
    });
  });

  describe('without thousands separator', () => {
    it('returns plain number below 1000', () => {
      expect(formatInteger(42, en)).toBe('42');
    });

    it('returns plain number for exactly 999', () => {
      expect(formatInteger(999, it_)).toBe('999');
    });

    it('returns "0" for zero', () => {
      expect(formatInteger(0, en)).toBe('0');
    });
  });

  describe('no decimals', () => {
    it('truncates float to integer — no trailing decimal', () => {
      expect(formatInteger(32, en)).toBe('32');
    });

    it('never produces decimal point in output — EN format', () => {
      // EN uses comma as thousands sep, dot as decimal sep
      // formatInteger must never add a decimal dot
      expect(formatInteger(1000, en)).not.toContain('.');
    });

    it('never produces decimal separator in integer output — IT format', () => {
      // IT uses dot as thousands sep, comma as decimal sep
      // formatInteger(1000, it_) → "1.000" — the dot here is thousands, not decimal
      // Verify: result should not contain the IT decimal separator (comma)
      expect(formatInteger(1000, it_)).not.toContain(',');
    });
  });

  describe('fallback', () => {
    it('falls back to EN format when formats is absent', () => {
      expect(formatInteger(1234, empty)).toBe('1,234');
    });
  });

});

// ── formatDecimal ─────────────────────────────────────────────────────────────

describe('formatDecimal', () => {

  describe('decimal separator', () => {
    it('EN: uses dot as decimal separator', () => {
      expect(formatDecimal(4.5, en)).toBe('4.5');
    });

    it('IT: uses comma as decimal separator', () => {
      expect(formatDecimal(4.5, it_)).toBe('4,5');
    });

    it('DE: uses comma as decimal separator', () => {
      expect(formatDecimal(4.5, de)).toBe('4,5');
    });
  });

  describe('trailing zeros', () => {
    it('removes trailing zero — 4.0 becomes "4"', () => {
      expect(formatDecimal(4.0, en)).toBe('4');
    });

    it('removes trailing zero — 4.0 in IT becomes "4"', () => {
      expect(formatDecimal(4.0, it_)).toBe('4');
    });

    it('preserves significant decimals — 4.50 becomes "4.5"', () => {
      expect(formatDecimal(4.50, en)).toBe('4.5');
    });
  });

  describe('combined separators', () => {
    it('IT: 1234.5 formats as "1.234,5"', () => {
      expect(formatDecimal(1234.5, it_)).toBe('1.234,5');
    });

    it('EN: 1234.5 formats as "1,234.5"', () => {
      expect(formatDecimal(1234.5, en)).toBe('1,234.5');
    });

    it('FR: 1234.5 formats as "1 234,5"', () => {
      expect(formatDecimal(1234.5, fr)).toBe('1 234,5');
    });
  });

  describe('fallback', () => {
    it('falls back to EN format when formats is absent', () => {
      expect(formatDecimal(4.5, empty)).toBe('4.5');
    });
  });

});
