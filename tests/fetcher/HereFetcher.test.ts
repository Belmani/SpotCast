// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — HereFetcher tests (Vitest)
//
//  Strategy: mock fetch() globally — no real HTTP calls in tests.
//  GeoCache uses a temp file per test — same approach as DedupService.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempCache(): string {
  const p = path.join(os.tmpdir(), `geocache_test_${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify({}));
  return p;
}

function makeConfig(overrides = {}) {
  return {
    here_api_key:          'test-here-key',
    categories:            ['100-1000-0000'],  // already resolved codes
    cities:                ['Berlin'],
    countries:             ['Germany'],
    search_radius_meters:  15000,
    ...overrides,
  };
}

function makeHereItem(id: string, name: string) {
  return {
    id,
    title: name,
    address: {
      label:       `${name} St, Berlin, Germany`,
      city:        'Berlin',
      countryName: 'Germany',
    },
    position:   { lat: 52.52, lng: 13.40 },
    contacts:   [{ phone: [{ value: '+49123456' }], www: [{ value: 'https://example.com' }] }],
    categories: [{ id: '100-1000-0000', name: 'Bar/Pub' }],
  };
}

function makeGeocodeResponse(lat: number, lng: number) {
  return {
    items: [{ position: { lat, lng }, address: { label: 'Berlin, Germany' } }],
  };
}

function makeBrowseResponse(items: unknown[], nextPageToken?: string) {
  return { items, next: nextPageToken };
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HereFetcher', () => {
  let cachePath: string;

  beforeEach(() => {
    cachePath = makeTempCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  });

  async function buildFetcher(configOverrides = {}) {
    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    return new HereFetcher(makeConfig(configOverrides), cachePath);
  }

  // ── Geocoding ───────────────────────────────────────────────────────────────

  it('geocodes a city via HERE API on first call', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeGeocodeResponse(52.52, 13.40) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([]) });

    const fetcher = await buildFetcher();
    await fetcher.fetchAll();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('geocode.search.hereapi.com')
    );
  });

  it('uses geocache on second call — no extra geocode request', async () => {
    // Pre-populate cache
    fs.writeFileSync(cachePath, JSON.stringify({
      'Berlin, Germany': { lat: 52.52, lng: 13.40 },
    }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([]) });

    const fetcher = await buildFetcher();
    await fetcher.fetchAll();

    // Only one fetch call — browse, no geocode
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('browse.search.hereapi.com')
    );
  });

  it('saves new geocode result to cache file', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeGeocodeResponse(52.52, 13.40) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([]) });

    const fetcher = await buildFetcher();
    await fetcher.fetchAll();

    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(cache['Berlin, Germany']).toEqual({ lat: 52.52, lng: 13.40 });
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('returns all results from a single page', async () => {
    const items = [makeHereItem('1', 'Bar One'), makeHereItem('2', 'Bar Two')];

    fs.writeFileSync(cachePath, JSON.stringify({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(items) });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Bar One');
  });

  it('paginates when first page returns 100 items', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeHereItem(`id${i}`, `Bar ${i}`));
    const page2 = [makeHereItem('id100', 'Bar 100'), makeHereItem('id101', 'Bar 101')];

    fs.writeFileSync(cachePath, JSON.stringify({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(page1, 'next-token') })
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(page2) });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(102);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops paginating when page returns less than 100 items', async () => {
    const items = Array.from({ length: 50 }, (_, i) => makeHereItem(`id${i}`, `Bar ${i}`));

    fs.writeFileSync(cachePath, JSON.stringify({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(items) });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(50);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ── Multiple categories × cities ────────────────────────────────────────────

  it('iterates all category × city combinations', async () => {
    const config = makeConfig({
      categories: ['100-1000-0000', '400-4100-0141'],
      cities:     ['Berlin', 'Munich'],
    });

    fs.writeFileSync(cachePath, JSON.stringify({
      'Berlin, Germany': { lat: 52.52, lng: 13.40 },
      'Munich, Germany': { lat: 48.14, lng: 11.58 },
    }));

    // 4 combinations → 4 browse calls
    mockFetch.mockResolvedValue({ ok: true, json: async () => makeBrowseResponse([]) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(config as any, cachePath);
    await fetcher.fetchAll();

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  // ── Business mapping ─────────────────────────────────────────────────────────

  it('maps HERE item to Business model correctly', async () => {
    const item = makeHereItem('ChIJtest123', 'Test Bar');

    fs.writeFileSync(cachePath, JSON.stringify({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([item]) });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();

    expect(result[0]).toMatchObject({
      place_id: 'ChIJtest123',
      name:     'Test Bar',
      city:     'Berlin',
      country:  'Germany',
    });
    expect(result[0].maps_url).toContain('ChIJtest123');
    expect(result[0].first_seen).toBeUndefined(); // set by DedupService, not Fetcher
  });

  it('handles missing optional fields gracefully', async () => {
    const item = {
      id:         'min-id',
      title:      'Minimal Bar',
      address:    { label: 'Berlin', city: 'Berlin', countryName: 'Germany' },
      position:   { lat: 52.52, lng: 13.40 },
      contacts:   [],
      categories: [],
    };

    fs.writeFileSync(cachePath, JSON.stringify({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([item]) });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();

    expect(result[0].phone).toBeUndefined();
    expect(result[0].website).toBeUndefined();
    expect(result[0].rating).toBeUndefined();
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('returns partial results if one combination fails', async () => {
    const items = [makeHereItem('id1', 'Good Bar')];
    const config = makeConfig({
      categories: ['100-1000-0000', '400-4100-0141'],
      cities:     ['Berlin'],
    });

    fs.writeFileSync(cachePath, JSON.stringify({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(items) })
      .mockRejectedValueOnce(new Error('HERE API timeout'));

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(config as any, cachePath);
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(1); // partial — no crash
  });

  it('returns empty array if geocoding fails and city is not cached', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();
    // geocoding failure is logged and swallowed — partial results (empty)
    expect(result).toEqual([]);
  });
});

// ── HereCategoryMap ───────────────────────────────────────────────────────────

describe('HereCategoryMap', () => {
  it('resolves known categories', async () => {
    const { resolveCategory } = await import('../../src/fetcher/HereCategoryMap');
    expect(resolveCategory('Bar')).toBe('100-1000-0000');
    expect(resolveCategory('Gym')).toBe('400-4100-0141');
    expect(resolveCategory('Lawyer')).toBe('700-7400-0246');
  });

  it('returns undefined for unknown category', async () => {
    const { resolveCategory } = await import('../../src/fetcher/HereCategoryMap');
    expect(resolveCategory('Unicorn Rental')).toBeUndefined();
  });

  it('listCategories returns sorted array', async () => {
    const { listCategories } = await import('../../src/fetcher/HereCategoryMap');
    const cats = listCategories();
    expect(cats).toEqual([...cats].sort());
    expect(cats.length).toBeGreaterThan(10);
  });
});