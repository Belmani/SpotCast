// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — format
//  Localised formatting for dates and numbers (DTR-037).
//
//  Three separate functions for three distinct use cases:
//    formatDate    — reads i18n.formats.date pattern
//    formatInteger — whole numbers only, thousands separator, no decimals
//    formatDecimal — float numbers, decimal + thousands separators
//
//  All functions:
//    - receive an already-loaded i18n dictionary (do not touch filesystem)
//    - fall back to EN defaults when i18n.formats is absent or incomplete
//    - never mutate the input dictionary
// ─────────────────────────────────────────────────────────────────────────────

// ── EN defaults ───────────────────────────────────────────────────────────────

const DEFAULT_DATE_PATTERN     = 'YYYY-MM-DD';
const DEFAULT_DECIMAL_SEP      = '.';
const DEFAULT_THOUSANDS_SEP    = ',';

// ── Internal helper — extracts formats safely ─────────────────────────────────

interface Formats {
  date:                string;
  decimal_separator:   string;
  thousands_separator: string;
}

function getFormats(i18n: Record<string, unknown>): Formats {
  const fmt = (i18n['formats'] ?? {}) as Partial<Formats>;
  return {
    date:                fmt.date                ?? DEFAULT_DATE_PATTERN,
    decimal_separator:   fmt.decimal_separator   ?? DEFAULT_DECIMAL_SEP,
    thousands_separator: fmt.thousands_separator ?? DEFAULT_THOUSANDS_SEP,
  };
}

// ── formatDate ────────────────────────────────────────────────────────────────

/**
 * Formats a Date according to the pattern in i18n.formats.date.
 *
 * Supported tokens: YYYY, MM, DD, 年, 月, 日 (for ZH/JA patterns).
 * Single-digit days and months are zero-padded.
 *
 * @example
 *   formatDate(new Date('2026-06-10'), { formats: { date: 'DD/MM/YYYY' } })
 *   // → "10/06/2026"
 */
export function formatDate(date: Date, i18n: Record<string, unknown>): string {
  const { date: pattern } = getFormats(i18n);

  const yyyy = String(date.getUTCFullYear());
  const mm   = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(date.getUTCDate()).padStart(2, '0');

  return pattern
    .replace('YYYY', yyyy)
    .replace('MM',   mm)
    .replace('DD',   dd);
}

// ── formatInteger ─────────────────────────────────────────────────────────────

/**
 * Formats a whole number with the localised thousands separator.
 * Never produces decimal digits — "32.00 new businesses" makes no sense.
 *
 * @example
 *   formatInteger(1234, { formats: { thousands_separator: '.' } })
 *   // → "1.234"
 */
export function formatInteger(n: number, i18n: Record<string, unknown>): string {
  const { thousands_separator } = getFormats(i18n);
  const integer = Math.trunc(n);
  return applyThousandsSeparator(String(integer), thousands_separator);
}

// ── formatDecimal ─────────────────────────────────────────────────────────────

/**
 * Formats a float number with localised decimal and thousands separators.
 * Removes trailing zeros after the decimal point.
 *
 * @example
 *   formatDecimal(1234.5, { formats: { decimal_separator: ',', thousands_separator: '.' } })
 *   // → "1.234,5"
 *
 *   formatDecimal(4.0, { formats: { decimal_separator: ',' } })
 *   // → "4"
 */
export function formatDecimal(n: number, i18n: Record<string, unknown>): string {
  const { decimal_separator, thousands_separator } = getFormats(i18n);

  // Split into integer and decimal parts using EN dot as neutral separator
  const [intPart, decPart] = n.toFixed(10).split('.');

  // Remove trailing zeros from decimal part
  const trimmedDec = decPart ? decPart.replace(/0+$/, '') : '';

  const formattedInt = applyThousandsSeparator(intPart, thousands_separator);

  if (!trimmedDec) {
    return formattedInt;
  }

  return `${formattedInt}${decimal_separator}${trimmedDec}`;
}

// ── Internal helper — applies thousands separator ─────────────────────────────

function applyThousandsSeparator(intStr: string, separator: string): string {
  if (intStr.length <= 3) return intStr;

  // Insert separator every 3 digits from the right
  let result = '';
  let count  = 0;

  for (let i = intStr.length - 1; i >= 0; i--) {
    if (count > 0 && count % 3 === 0) {
      result = separator + result;
    }
    result = intStr[i] + result;
    count++;
  }

  return result;
}
