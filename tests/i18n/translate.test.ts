// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — translate tests (Vitest)
//
//  Tests the three-level fallback chain:
//    1. active language dictionary
//    2. en.json fallback
//    3. key itself as last resort
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { t } from '../../src/i18n/translate';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const active: Record<string, string> = {
  greeting: 'Ciao',
  farewell: 'Arrivederci',
  empty_value: '',
};

const fallback: Record<string, string> = {
  greeting: 'Hello',
  farewell: 'Goodbye',
  empty_value: 'Default value',
  only_in_fallback: 'Fallback only',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('translate — t()', () => {

  describe('level 1 — active language', () => {
    it('returns the value from the active dictionary when the key exists', () => {
      expect(t('greeting', active, fallback)).toBe('Ciao');
    });

    it('returns the active value even when fallback also has the key', () => {
      expect(t('farewell', active, fallback)).toBe('Arrivederci');
    });
  });

  describe('level 2 — en.json fallback', () => {
    it('returns the fallback value when the key is missing from active', () => {
      expect(t('only_in_fallback', active, fallback)).toBe('Fallback only');
    });

    it('uses fallback when active value is an empty string', () => {
      // Empty string is not a useful translation — fall through to fallback
      expect(t('empty_value', active, fallback)).toBe('Default value');
    });
  });

  describe('level 3 — key as last resort', () => {
    it('returns the key itself when missing from both dictionaries', () => {
      expect(t('completely_missing_key', active, fallback)).toBe('completely_missing_key');
    });

    it('returns the key itself when both dictionaries are empty', () => {
      expect(t('some_key', {}, {})).toBe('some_key');
    });
  });

  describe('edge cases', () => {
    it('handles keys with dot notation in their name', () => {
      const dict = { 'section.title': 'My Title' };
      expect(t('section.title', dict, {})).toBe('My Title');
    });

    it('handles keys with special characters', () => {
      const dict = { 'col_first_seen': 'Prima Rilevazione' };
      expect(t('col_first_seen', dict, {})).toBe('Prima Rilevazione');
    });

    it('does not mutate the input dictionaries', () => {
      const activeCopy = { ...active };
      const fallbackCopy = { ...fallback };
      t('greeting', active, fallback);
      expect(active).toEqual(activeCopy);
      expect(fallback).toEqual(fallbackCopy);
    });

    it('works with real en.json keys', async () => {
      const en = (await import('../../assets/i18n/en.json')).default;
      const it_ = (await import('../../assets/i18n/it.json')).default;
      // Italian has sheet_businesses translated — should return Italian value
      expect(t('sheet_businesses', it_ as Record<string, string>, en as Record<string, string>))
        .toBe('Aziende');
    });

    it('real en.json fallback for a key missing in a stub dict', async () => {
      const en = (await import('../../assets/i18n/en.json')).default;
      // Empty active dict — should fall through to en.json
      expect(t('sheet_businesses', {}, en as Record<string, string>))
        .toBe('Businesses');
    });
  });
});
