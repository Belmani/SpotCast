// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — DedupService
//  Manages seen_firms.json — tracks which businesses have already been sent.
//
//  Responsibilities (DTR-021):
//    - seen[]      : array of place_id already sent — the only data in the file
//    - last_reset  : ISO timestamp of last --reset call — informational only
//
//  NOT stored here: first_seen, last_seen, categories, stats (→ M11+ SQLite)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { Business } from '../fetcher/Business';
import logger from '../logger';

// ── Internal store shape ──────────────────────────────────────────────────────

interface SeenStore {
  seen: string[];
  last_reset: string | null;
}

const EMPTY_STORE: SeenStore = { seen: [], last_reset: null };

// ── DedupService ──────────────────────────────────────────────────────────────

export class DedupService {
  private filePath: string;
  private store: SeenStore | null = null; // lazy — loaded on first use

  /**
   * @param filePath  Path to seen_firms.json.
   *                  Defaults to seen_firms.json in the current working directory.
   *                  Accept an explicit path for testability (same pattern as loadConfig).
   */
  constructor(filePath = path.resolve(process.cwd(), 'seen_firms.json')) {
    this.filePath = filePath;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Returns only the businesses whose place_id is NOT yet in the seen store.
   */
  filter(businesses: Business[]): Business[] {
    const store = this.load();
    const seenSet = new Set(store.seen);
    return businesses.filter(b => !seenSet.has(b.place_id));
  }

  /**
   * Marks businesses as seen:
   *  - Adds their place_id to seen[]
   *  - Sets first_seen (only if not already set — never overwritten)
   *  - Sets last_seen (always updated to now)
   * Persists to disk synchronously.
   *
   * Call this AFTER sending the email — never before (DTR-020).
   */
  markSeen(businesses: Business[]): void {
    const store = this.load();
    const seenSet = new Set(store.seen);
    const now = new Date().toISOString();

    for (const business of businesses) {
      // first_seen: written once, never overwritten
      if (!business.first_seen) {
        business.first_seen = now;
      }
      // last_seen: always updated
      business.last_seen = now;

      if (!seenSet.has(business.place_id)) {
        store.seen.push(business.place_id);
        seenSet.add(business.place_id);
      }
    }

    this.persist(store);
  }

  /**
   * Clears the seen list and records the reset timestamp.
   * Invoked via the --reset CLI flag.
   */
  reset(): void {
    const store: SeenStore = {
      seen: [],
      last_reset: new Date().toISOString(),
    };
    this.store = store;
    this.persist(store);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Lazy loader — reads the file on first call, caches in memory.
   * Missing file   → creates empty store (no error).
   * Corrupt JSON   → logs warning, returns empty store (no crash).
   */
  private load(): SeenStore {
    if (this.store !== null) return this.store;

    if (!fs.existsSync(this.filePath)) {
      logger.info(`seen_firms.json not found at ${this.filePath} — starting fresh`);
      this.store = { ...EMPTY_STORE, seen: [] };
      return this.store;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SeenStore;

      // Basic structural validation
      if (!Array.isArray(parsed.seen)) {
        throw new Error('seen field is not an array');
      }

      this.store = parsed;
      return this.store;
    } catch (err) {
      logger.warn(
        `seen_firms.json is corrupt or unreadable: ${(err as Error).message} — starting fresh`
      );
      this.store = { ...EMPTY_STORE, seen: [] };
      return this.store;
    }
  }

  /**
   * Writes the store to disk synchronously.
   * Synchronous write is intentional (DTR-021): the file is small and
   * sync guarantees data is on disk even if the process is killed immediately after.
   */
  private persist(store: SeenStore): void {
    this.store = store;
    fs.writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf-8');
  }
}
