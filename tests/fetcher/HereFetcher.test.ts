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

function makeTempCache(initial: object = {}): string {
  const p = path.join(os.tmpdir(), `geocache_test_${Date.now()}_${Math.random()}.json`);
  fs.writeFileSync(p, JSON.stringify(initial));
  return p;
}

function makeConfig(overrides = {}) {
  return {
    here_api_key:         'test-here-key',
    categories:           ['100-1000-0000'],
    city_list:            ['Berlin, Germany'],
    search_radius_meters: 15000,
    ...overrides,
  };
}

function makeHereItem(id: string, name: string) {
  return {
    id,
    title: name,
    address: { label: `${name} St, Berlin, Germany`, city: 'Berlin', countryName: 'Germany' },
    position:   { lat: 52.52, lng: 13.40 },
    contacts:   [{ phone: [{ value: '+49123456' }], www: [{ value: 'https://example.com' }] }],
    categories: [{ id: '100-1000-0000', name: 'Bar/Pub' }],
  };
}

function makeGeocodeResponse(lat: number, lng: number) {
  return { items: [{ position: { lat, lng }, address: { label: 'Berlin, Germany' } }] };
}

function makeBrowseResponse(items: unknown[]) {
  return { items };
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
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([]) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig(), cachePath2);
    await fetcher.fetchAll();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('browse.search.hereapi.com'));

    fs.unlinkSync(cachePath2);
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
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });
    const items = [makeHereItem('1', 'Bar One'), makeHereItem('2', 'Bar Two')];

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(items) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig(), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Bar One');
    fs.unlinkSync(cachePath2);
  });

  it('paginates when first page returns 100 items', async () => {
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });
    const page1 = Array.from({ length: 100 }, (_, i) => makeHereItem(`id${i}`, `Bar ${i}`));
    const page2 = [makeHereItem('id100', 'Bar 100')];

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(page1) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(page2) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig(), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(101);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    fs.unlinkSync(cachePath2);
  });

  it('stops paginating when page returns less than 100 items', async () => {
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });
    const items = Array.from({ length: 50 }, (_, i) => makeHereItem(`id${i}`, `Bar ${i}`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse(items) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig(), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(50);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    fs.unlinkSync(cachePath2);
  });

  // ── Multiple categories × cities ────────────────────────────────────────────

  it('iterates all category × city combinations', async () => {
    const cachePath2 = makeTempCache({
      'Berlin, Germany': { lat: 52.52, lng: 13.40 },
      'Roma, Italy':     { lat: 41.90, lng: 12.50 },
    });

    mockFetch.mockResolvedValue({ ok: true, json: async () => makeBrowseResponse([]) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig({
      categories: ['100-1000-0000', '400-4100-0141'],
      city_list:  ['Berlin, Germany', 'Roma, Italy'],
    }), cachePath2);
    await fetcher.fetchAll();

    // 2 categories × 2 cities = 4 browse calls (no geocode — all cached)
    expect(mockFetch).toHaveBeenCalledTimes(4);
    fs.unlinkSync(cachePath2);
  });

  // ── Business mapping ─────────────────────────────────────────────────────────

  it('maps HERE item to Business model correctly', async () => {
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });
    const item = makeHereItem('here:test123', 'Test Bar');

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([item]) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig(), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result[0]).toMatchObject({
      place_id: 'here:test123',
      name:     'Test Bar',
      city:     'Berlin',
      country:  'Germany',
      phone:    '+49123456',
      website:  'https://example.com',
    });
    expect(result[0].maps_url).toContain('here%3Atest123');
    expect(result[0].first_seen).toBeUndefined();
    fs.unlinkSync(cachePath2);
  });

  it('handles missing optional fields gracefully', async () => {
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });
    const item = {
      id: 'min-id', title: 'Minimal Bar',
      address:    { label: 'Berlin', city: 'Berlin', countryName: 'Germany' },
      position:   { lat: 52.52, lng: 13.40 },
      contacts:   [],
      categories: [],
    };

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([item]) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig(), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result[0].phone).toBeUndefined();
    expect(result[0].website).toBeUndefined();
    expect(result[0].rating).toBeUndefined();
    fs.unlinkSync(cachePath2);
  });

  // ── city_list parsing ────────────────────────────────────────────────────────

  it('correctly parses "city, country" string into separate city and country', async () => {
    const cachePath2 = makeTempCache({ 'Roma, Italy': { lat: 41.90, lng: 12.50 } });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeBrowseResponse([makeHereItem('id1', 'Test Bar')]),
    });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig({ city_list: ['Roma, Italy'] }), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result[0].city).toBe('Roma');
    expect(result[0].country).toBe('Italy');
    fs.unlinkSync(cachePath2);
  });

  it('handles city names with commas correctly — uses first comma as separator', async () => {
    // Edge case: "Frankfurt am Main, Germany" — city = "Frankfurt am Main"
    const cachePath2 = makeTempCache({
      'Frankfurt am Main, Germany': { lat: 50.11, lng: 8.68 },
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([]) });

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig({
      city_list: ['Frankfurt am Main, Germany'],
    }), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result).toEqual([]);
    fs.unlinkSync(cachePath2);
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('returns partial results if one combination fails', async () => {
    const cachePath2 = makeTempCache({ 'Berlin, Germany': { lat: 52.52, lng: 13.40 } });

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeBrowseResponse([makeHereItem('id1', 'Good Bar')]) })
      .mockRejectedValueOnce(new Error('HERE API timeout'));

    const { HereFetcher } = await import('../../src/fetcher/HereFetcher');
    const fetcher = new HereFetcher(makeConfig({
      categories: ['100-1000-0000', '400-4100-0141'],
    }), cachePath2);
    const result = await fetcher.fetchAll();

    expect(result).toHaveLength(1);
    fs.unlinkSync(cachePath2);
  });

  it('returns empty array if geocoding fails and city is not cached', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    const fetcher = await buildFetcher();
    const result = await fetcher.fetchAll();

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
