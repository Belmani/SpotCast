// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — GoogleFetcher tests (Vitest)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleFetcher } from '../../src/fetcher/GoogleFetcher';
import { Config } from '../../src/config/ConfigLoader';

// ── Mock ──────────────────────────────────────────────────────────────────────
// Client must be mocked as a regular function (not arrow) because GoogleFetcher
// calls `new Client()` — arrow functions cannot be used as constructors.

const mockTextSearch = vi.fn();

vi.mock('@googlemaps/google-maps-services-js', () => ({
  Client: function () {
    return { textSearch: mockTextSearch };
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockConfig: Config = {
  language: 'en',
  google_api_key: 'test-api-key',
  categories: ['Dentist', 'Gym'],
  cities: ['Milan'],
  countries: ['Italy'],
  results_per_run: 5,
  schedule: '0 8 * * *',
  output_dir: 'results',
  smtp: { host: 'smtp.test.com', port: 587, user: 'test@test.com', pass: 'pass' },
  email_to: ['dest@test.com'],
  email_template: 'templates/email.html',
};

const mockPlace = {
  place_id: 'ChIJ_test_123',
  name: 'Studio Dentistico Rossi',
  formatted_address: 'Via Roma 1, 20100 Milan, Italy',
  formatted_phone_number: '+39 02 12345678',
  website: 'https://www.rossi-dental.it',
  rating: 4.5,
  user_ratings_total: 120,
};

const mockApiResponse = {
  data: { results: [mockPlace] },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GoogleFetcher', () => {
  let fetcher: GoogleFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    fetcher = new GoogleFetcher(mockConfig);
    mockTextSearch.mockResolvedValue(mockApiResponse);
  });

  // ── Mapping ─────────────────────────────────────────────────────────────────

  describe('fetchOne — successful response', () => {
    it('maps place_id correctly', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].place_id).toBe('ChIJ_test_123');
    });

    it('maps name correctly', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].name).toBe('Studio Dentistico Rossi');
    });

    it('sets category from parameter, not from Google classification', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].category).toBe('Dentist');
    });

    it('sets city from parameter', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].city).toBe('Milan');
    });

    it('sets country from config', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].country).toBe('Italy');
    });

    it('maps address correctly', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].address).toBe('Via Roma 1, 20100 Milan, Italy');
    });

    it('maps rating correctly', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].rating).toBe(4.5);
    });

    it('maps review_count correctly', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].review_count).toBe(120);
    });

    it('builds maps_url with place_id', async () => {
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results[0].maps_url).toBe(
        'https://www.google.com/maps/place/?q=place_id:ChIJ_test_123'
      );
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe('fetchOne — error handling', () => {
    it('returns empty array on network error without throwing', async () => {
      mockTextSearch.mockRejectedValueOnce(new Error('Network error'));
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results).toEqual([]);
    });

    it('returns empty array on quota exceeded without throwing', async () => {
      mockTextSearch.mockRejectedValueOnce(new Error('OVER_DAILY_LIMIT'));
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results).toEqual([]);
    });

    it('filters out results without place_id', async () => {
      mockTextSearch.mockResolvedValueOnce({
        data: {
          results: [
            { name: 'No ID Business' }, // missing place_id — must be filtered
            mockPlace,
          ],
        },
      });
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results).toHaveLength(1);
      expect(results[0].place_id).toBe('ChIJ_test_123');
    });

    it('filters out results without name', async () => {
      mockTextSearch.mockResolvedValueOnce({
        data: {
          results: [
            { place_id: 'ChIJ_no_name' }, // missing name — must be filtered
            mockPlace,
          ],
        },
      });
      const results = await fetcher.fetchOne('Dentist', 'Milan', 5);
      expect(results).toHaveLength(1);
    });
  });

  // ── Limit enforcement ───────────────────────────────────────────────────────

  describe('fetchOne — limit enforcement', () => {
    it('returns at most `limit` results', async () => {
      mockTextSearch.mockResolvedValueOnce({
        data: {
          results: Array.from({ length: 10 }, (_, i) => ({
            ...mockPlace,
            place_id: `ChIJ_${i}`,
          })),
        },
      });
      const results = await fetcher.fetchOne('Dentist', 'Milan', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  // ── fetchAll ────────────────────────────────────────────────────────────────

  describe('fetchAll', () => {
    it('respects results_per_run from config', async () => {
      mockTextSearch.mockResolvedValue({
        data: {
          results: Array.from({ length: 10 }, (_, i) => ({
            ...mockPlace,
            place_id: `ChIJ_${i}`,
            name: `Business ${i}`,
          })),
        },
      });
      const results = await fetcher.fetchAll();
      expect(results.length).toBeLessThanOrEqual(mockConfig.results_per_run);
    });

    it('queries all category/city combinations', async () => {
      mockTextSearch.mockResolvedValue({ data: { results: [] } });
      await fetcher.fetchAll();
      // 2 categories × 1 city = 2 calls
      expect(mockTextSearch).toHaveBeenCalledTimes(2);
    });

    it('stops querying when results_per_run is reached', async () => {
      // First call fills the quota entirely — second call must not happen
      const limitedFetcher = new GoogleFetcher({ ...mockConfig, results_per_run: 5, categories: ['Dentist', 'Gym'] });
      mockTextSearch.mockResolvedValue({
        data: {
          results: Array.from({ length: 5 }, (_, i) => ({
            ...mockPlace,
            place_id: `ChIJ_${i}`,
            name: `Business ${i}`,
          })),
        },
      });
      const results = await limitedFetcher.fetchAll();
      expect(results.length).toBe(5);
      expect(mockTextSearch).toHaveBeenCalledTimes(1);
    });
  });
});