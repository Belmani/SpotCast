// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — HereFetcher
//  Fetches business data from HERE Browse API (geographic search).
//
//  Contract:
//    - Receives already-resolved HERE category codes (DTR-043)
//    - Paginates automatically until results exhausted (DTR-044)
//    - Uses GeoCache for coordinates — no redundant geocode calls (DTR-045)
//    - On error for a single combination: logs + returns partial, never throws
//    - On geocoding failure: throws — cannot proceed without coordinates
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { Business } from './Business';
import logger from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HereConfig {
  here_api_key:         string;
  categories:           string[];   // HERE category codes — already resolved
  cities:               string[];
  countries:            string[];
  search_radius_meters?: number;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface HereItem {
  id:         string;
  title:      string;
  address:    { label?: string; city?: string; countryName?: string };
  position:   { lat: number; lng: number };
  contacts?:  Array<{
    phone?: Array<{ value: string }>;
    www?:   Array<{ value: string }>;
  }>;
  categories?: Array<{ id: string; name: string }>;
  rating?:    number;
  ratingCount?: number;
}

interface BrowseResponse {
  items: HereItem[];
  next?: string;
}

interface GeocodeResponse {
  items: Array<{ position: { lat: number; lng: number }; address: { label: string } }>;
}

// ── GeoCache ──────────────────────────────────────────────────────────────────

class GeoCache {
  private cache: Record<string, Coordinates> = {};
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, Coordinates>;
      }
    } catch {
      logger.warn(`geocache: failed to load ${this.filePath} — starting fresh`);
      this.cache = {};
    }
  }

  get(city: string, country: string): Coordinates | undefined {
    return this.cache[`${city}, ${country}`];
  }

  set(city: string, country: string, coords: Coordinates): void {
    const key = `${city}, ${country}`;
    this.cache[key] = coords;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
    } catch (err) {
      logger.warn(`geocache: failed to persist ${key} — ${(err as Error).message}`);
    }
  }
}

// ── HereFetcher ───────────────────────────────────────────────────────────────

const HERE_BROWSE_URL  = 'https://browse.search.hereapi.com/v1/browse';
const HERE_GEOCODE_URL = 'https://geocode.search.hereapi.com/v1/geocode';
const PAGE_SIZE        = 100;
const DEFAULT_RADIUS   = 15000;

export class HereFetcher {
  private config:   HereConfig;
  private geoCache: GeoCache;

  constructor(config: HereConfig, geoCachePath?: string) {
    this.config   = config;
    const cachePath = geoCachePath
      ?? path.resolve(process.cwd(), 'geocache.json');
    this.geoCache = new GeoCache(cachePath);
  }

  /**
   * Fetches all businesses for every category × city combination.
   */
  async fetchAll(): Promise<Business[]> {
    const results: Business[] = [];

    for (const city of this.config.cities) {
      for (const categoryCode of this.config.categories) {
        try {
          const batch = await this.fetchOne(categoryCode, city);
          results.push(...batch);
        } catch (err) {
          logger.error(
            `HereFetcher error for "${categoryCode}" in "${city}": ${(err as Error).message}`
          );
          // partial results — continue with next combination
        }
      }
    }

    return results;
  }

  /**
   * Fetches all businesses for a single category × city combination.
   * Paginates automatically until HERE returns less than PAGE_SIZE items.
   */
  async fetchOne(categoryCode: string, city: string): Promise<Business[]> {
    const country = this.config.countries[0] ?? '';
    const coords  = await this.resolveCoords(city, country);
    const radius  = this.config.search_radius_meters ?? DEFAULT_RADIUS;
    const results: Business[] = [];

    let offset = 0;

    do {
      const url = new URL(HERE_BROWSE_URL);
      url.searchParams.set('at',         `${coords.lat},${coords.lng}`);
      url.searchParams.set('categories', categoryCode);
      url.searchParams.set('limit',      String(PAGE_SIZE));
      url.searchParams.set('offset',     String(offset));
      url.searchParams.set('in',         `circle:${coords.lat},${coords.lng};r=${radius}`);
      url.searchParams.set('apiKey',     this.config.here_api_key);

      logger.debug(`HERE Browse: ${categoryCode} in ${city} (offset=${offset})`);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HERE Browse API error ${response.status} for "${categoryCode}" in "${city}"`);
      }

      const data = await response.json() as BrowseResponse;
      const mapped = data.items.map(item => this.mapToBusiness(item, city, country));
      results.push(...mapped);

      if (data.items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;

    } while (true);

    logger.info(`HERE Browse: found ${results.length} businesses for "${categoryCode}" in "${city}"`);
    return results;
  }

  // ── Geocoding ───────────────────────────────────────────────────────────────

  private async resolveCoords(city: string, country: string): Promise<Coordinates> {
    const cached = this.geoCache.get(city, country);
    if (cached) {
      logger.debug(`Geocache hit: ${city}, ${country}`);
      return cached;
    }

    logger.debug(`Geocaching: ${city}, ${country}`);

    const url = new URL(HERE_GEOCODE_URL);
    url.searchParams.set('q',      `${city}, ${country}`);
    url.searchParams.set('apiKey', this.config.here_api_key);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HERE Geocoding failed for "${city}, ${country}": HTTP ${response.status}`);
    }

    const data = await response.json() as GeocodeResponse;
    if (!data.items.length) {
      throw new Error(`HERE Geocoding returned no results for "${city}, ${country}"`);
    }

    const coords: Coordinates = {
      lat: data.items[0].position.lat,
      lng: data.items[0].position.lng,
    };

    this.geoCache.set(city, country, coords);
    return coords;
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private mapToBusiness(item: HereItem, city: string, country: string): Business {
    const phone   = item.contacts?.[0]?.phone?.[0]?.value;
    const website = item.contacts?.[0]?.www?.[0]?.value;

    return {
      place_id:     item.id,
      name:         item.title,
      category:     item.categories?.[0]?.name ?? '',
      city,
      country,
      address:      item.address.label ?? '',
      phone,
      website,
      rating:       item.rating,
      review_count: item.ratingCount,
      maps_url:     `https://maps.here.com/?q=${encodeURIComponent(item.title)}&map=${item.position.lat},${item.position.lng},15,normal&ref=${item.id}`,
    };
  }
}