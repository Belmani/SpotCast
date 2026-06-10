// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — DedupService tests (Vitest)
//
//  Strategy: real temp files in os.tmpdir() — no fs mocking.
//  Rationale: mocking fs hides real serialisation bugs.
//  Each test gets its own isolated file path → safe parallel execution.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DedupService } from '../../src/dedup/DedupService';
import { Business } from '../../src/fetcher/Business';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcast-dedup-'));
  return path.join(dir, 'seen_firms.json');
}

function makeBusiness(place_id: string, overrides: Partial<Business> = {}): Business {
  return {
    place_id,
    name: `Business ${place_id}`,
    category: 'Dentist',
    city: 'Milan',
    country: 'Italy',
    address: 'Via Roma 1, Milan',
    maps_url: `https://www.google.com/maps/place/?q=place_id:${place_id}`,
    ...overrides,
  };
}

function isValidIso(value: string | undefined): boolean {
  if (!value) return false;
  return !isNaN(Date.parse(value));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DedupService', () => {

  // ── filter ──────────────────────────────────────────────────────────────────

  describe('filter', () => {
    it('returns all businesses when store is empty', () => {
      const dedup = new DedupService(tmpFile());
      const businesses = [makeBusiness('A'), makeBusiness('B')];
      expect(dedup.filter(businesses)).toHaveLength(2);
    });

    it('returns empty array when all businesses are already seen', () => {
      const file = tmpFile();
      fs.writeFileSync(file, JSON.stringify({ seen: ['A', 'B'], last_reset: null }));
      const dedup = new DedupService(file);
      const businesses = [makeBusiness('A'), makeBusiness('B')];
      expect(dedup.filter(businesses)).toHaveLength(0);
    });

    it('returns only unseen businesses on partial overlap', () => {
      const file = tmpFile();
      fs.writeFileSync(file, JSON.stringify({ seen: ['A'], last_reset: null }));
      const dedup = new DedupService(file);
      const businesses = [makeBusiness('A'), makeBusiness('B'), makeBusiness('C')];
      const result = dedup.filter(businesses);
      expect(result).toHaveLength(2);
      expect(result.map(b => b.place_id)).toEqual(['B', 'C']);
    });
  });

  // ── markSeen ────────────────────────────────────────────────────────────────

  describe('markSeen', () => {
    it('persists place_ids to disk — verified by a fresh instance', () => {
      const file = tmpFile();
      const dedup1 = new DedupService(file);
      const businesses = [makeBusiness('A'), makeBusiness('B')];
      dedup1.markSeen(businesses);

      // Fresh instance reads from disk
      const dedup2 = new DedupService(file);
      expect(dedup2.filter(businesses)).toHaveLength(0);
    });

    it('sets first_seen on each business', () => {
      const dedup = new DedupService(tmpFile());
      const businesses = [makeBusiness('A'), makeBusiness('B')];
      dedup.markSeen(businesses);
      for (const b of businesses) {
        expect(isValidIso(b.first_seen)).toBe(true);
      }
    });

    it('sets last_seen on each business', () => {
      const dedup = new DedupService(tmpFile());
      const businesses = [makeBusiness('A')];
      dedup.markSeen(businesses);
      expect(isValidIso(businesses[0].last_seen)).toBe(true);
    });

    it('does NOT overwrite first_seen on second call', () => {
      const file = tmpFile();
      const dedup = new DedupService(file);
      const business = makeBusiness('A');

      dedup.markSeen([business]);
      const originalFirstSeen = business.first_seen;

      // Simulate time passing
      const laterDedup = new DedupService(file);
      // Re-use same object with first_seen already set
      laterDedup.markSeen([business]);

      expect(business.first_seen).toBe(originalFirstSeen);
    });

    it('updates last_seen on second call while preserving first_seen', () => {
      const dedup = new DedupService(tmpFile());
      const business = makeBusiness('A');

      // First call
      dedup.markSeen([business]);
      const firstSeenAfterFirst = business.first_seen;
      const lastSeenAfterFirst = business.last_seen;

      // Tiny delay to ensure timestamp differs
      const before = Date.now();
      while (Date.now() === before) { /* spin */ }

      // Second call — same instance (store cached in memory)
      dedup.markSeen([business]);

      expect(business.first_seen).toBe(firstSeenAfterFirst);   // unchanged
      expect(business.last_seen).not.toBe(lastSeenAfterFirst); // updated
    });

    it('does not add duplicate place_ids to seen array', () => {
      const file = tmpFile();
      const dedup = new DedupService(file);
      const business = makeBusiness('A');

      dedup.markSeen([business]);
      dedup.markSeen([business]);

      const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const occurrences = (stored.seen as string[]).filter(id => id === 'A').length;
      expect(occurrences).toBe(1);
    });
  });

  // ── reset ───────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('empties the seen array', () => {
      const file = tmpFile();
      const dedup = new DedupService(file);
      dedup.markSeen([makeBusiness('A'), makeBusiness('B')]);
      dedup.reset();

      // After reset, all businesses appear as new
      const result = dedup.filter([makeBusiness('A'), makeBusiness('B')]);
      expect(result).toHaveLength(2);
    });

    it('sets last_reset to a valid ISO timestamp', () => {
      const file = tmpFile();
      const dedup = new DedupService(file);
      dedup.reset();

      const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(isValidIso(stored.last_reset)).toBe(true);
    });

    it('persists the empty state so a fresh instance sees it', () => {
      const file = tmpFile();
      const dedup1 = new DedupService(file);
      dedup1.markSeen([makeBusiness('A')]);
      dedup1.reset();

      const dedup2 = new DedupService(file);
      expect(dedup2.filter([makeBusiness('A')])).toHaveLength(1);
    });
  });

  // ── File handling ────────────────────────────────────────────────────────────

  describe('file handling', () => {
    it('creates seen_firms.json automatically when missing', () => {
      const file = tmpFile(); // path exists but file does not yet
      const dedup = new DedupService(file);
      dedup.markSeen([makeBusiness('A')]);
      expect(fs.existsSync(file)).toBe(true);
    });

    it('recovers from corrupt JSON without crashing', () => {
      const file = tmpFile();
      fs.writeFileSync(file, '{ this is not valid json }');
      const dedup = new DedupService(file);
      // Should not throw
      expect(() => dedup.filter([makeBusiness('A')])).not.toThrow();
    });

    it('logs a warning when JSON is corrupt', async () => {
      const file = tmpFile();
      fs.writeFileSync(file, '{ this is not valid json }');

      // Import logger to spy on it
      const loggerModule = await import('../../src/logger');
      const warnSpy = vi.spyOn(loggerModule.default, 'warn');

      const dedup = new DedupService(file);
      dedup.filter([makeBusiness('A')]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('corrupt')
      );
      warnSpy.mockRestore();
    });

    it('writes correctly after recovering from corrupt file', () => {
      const file = tmpFile();
      fs.writeFileSync(file, '{ this is not valid json }');

      const dedup = new DedupService(file);
      dedup.filter([makeBusiness('A')]); // triggers recovery
      dedup.markSeen([makeBusiness('A')]);

      const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(stored.seen).toContain('A');
    });

    it('treats seen as empty when file has invalid structure', () => {
      const file = tmpFile();
      // Valid JSON but wrong structure (seen is not an array)
      fs.writeFileSync(file, JSON.stringify({ seen: 'not-an-array', last_reset: null }));
      const dedup = new DedupService(file);
      const result = dedup.filter([makeBusiness('A')]);
      expect(result).toHaveLength(1);
    });
  });
});
