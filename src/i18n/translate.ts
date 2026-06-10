// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — translate
//  Shared i18n utility with three-level cascading fallback (DTR-027).
//
//  Usage:
//    t('sheet_businesses', activeDict, enDict)
//
//  Fallback chain:
//    1. active language dictionary  → preferred
//    2. en.json fallback            → universal safety net
//    3. key itself                  → makes missing keys visible in output
//
//  Contract:
//    - Does NOT load files — receives already-loaded dictionaries as parameters
//    - Does NOT mutate input dictionaries
//    - Empty string in active is treated as missing — falls through to fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a translation key against two dictionaries with cascading fallback.
 *
 * @param key      - The i18n key to look up
 * @param i18n     - Active language dictionary (e.g. it.json contents)
 * @param fallback - Fallback dictionary, always en.json
 * @returns        Translated string, or the key itself if not found anywhere
 */
export function t(
  key: string,
  i18n: Record<string, string>,
  fallback: Record<string, string>
): string {
  return i18n[key] || fallback[key] || key;
}
