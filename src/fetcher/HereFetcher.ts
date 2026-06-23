// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — HereFetcher
//  Fetches business data from HERE Browse API (geographic search).
//
//  Contract:
//    - Receives already-resolved HERE category codes (DTR-043)
//    - Receives flat "city, country" strings from CitiesLoader (DTR-047/048)
//    - Paginates until HERE returns less than PAGE_SIZE results
//    - A 400/404 on pagination is treated as end-of-results, not a fatal error
//    - GeoCache: memory-first, then file — one geocode call per city per run
//    - On geocoding failure: logs + skips that city, never throws
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { Business } from './Business';
import logger from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HereConfig {
  here_api_key:          string;
  categories:            string[];
  city_list:             string[];
  search_radius_meters?: number;
}

interface Coordinates { lat: number; lng: number; }

interface HereItem {
  id:          string;
  title:       string;
  address:     { label?: string; city?: string; countryName?: string };
  position:    { lat: number; lng: number };
  contacts?:   Array<{ phone?: Array<{ value: string }>; www?: Array<{ value: string }> }>;
  categories?: Array<{ id: string; name: string }>;
  rating?:     number;
  ratingCount?: number;
}

interface BrowseResponse  { items: HereItem[]; }
interface GeocodeResponse { items: Array<{ position: { lat: number; lng: number } }>; }

// ── GeoCache ──────────────────────────────────────────────────────────────────

class GeoCache {
  private memory:   Map<string, Coordinates> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, Coordinates>;
        for (const [key, coords] of Object.entries(data)) {
          this.memory.set(key, coords);
        }
        logger.debug(`Geocache loaded ${this.memory.size} entries from file`);
      }
    } catch {
      logger.warn(`geocache: failed to load ${this.filePath} — starting fresh`);
    }
  }

  get(key: string): Coordinates | undefined { return this.memory.get(key); }

  set(key: string, coords: Coordinates): void {
    this.memory.set(key, coords);
    try {
      const data: Record<string, Coordinates> = {};
      for (const [k, v] of this.memory.entries()) data[k] = v;
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.warn(`geocache: failed to persist "${key}" — ${(err as Error).message}`);
    }
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HERE_BROWSE_URL  = 'https://browse.search.hereapi.com/v1/browse';
const HERE_GEOCODE_URL = 'https://geocode.search.hereapi.com/v1/geocode';
const PAGE_SIZE        = 99; //100;
const DEFAULT_RADIUS   = 15000;

// ── HereFetcher ───────────────────────────────────────────────────────────────

export class HereFetcher {
  private config:   HereConfig;
  private geoCache: GeoCache;

  constructor(config: HereConfig, geoCachePath?: string) {
    this.config   = config;
    this.geoCache = new GeoCache(geoCachePath ?? path.resolve(process.cwd(), 'geocache.json'));
  }

  async fetchAll(): Promise<Business[]> {
    const results: Business[] = [];
    for (const cityCountry of this.config.city_list) {
      for (const categoryCode of this.config.categories) {
        try {
          results.push(...await this.fetchOne(categoryCode, cityCountry));
        } catch (err) {
          logger.error(`HereFetcher: "${categoryCode}" in "${cityCountry}" — ${(err as Error).message}`);
        }
      }
    }
    return results;
  }

  async fetchOne(categoryCode: string, cityCountry: string): Promise<Business[]> {
    const { city, country } = this.parseCityCountry(cityCountry);
    const coords  = await this.resolveCoords(cityCountry);
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

      logger.debug(`HERE Browse: "${categoryCode}" in "${cityCountry}" (offset=${offset})`);

      const response = await fetch(url.toString());

      // 400/404 on a non-first page = HERE has no more results at this offset
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`HERE error body: ${errorText}`);
        if (offset > 0) {
          logger.debug(`HERE Browse: end of results at offset=${offset} for "${categoryCode}" in "${cityCountry}" (HTTP ${response.status})`);
          break;
        }
        throw new Error(`HERE Browse API error ${response.status} for "${categoryCode}" in "${cityCountry}"`);
      }

      const data   = await response.json() as BrowseResponse;
      logger.info("loaded " + data.items.length + " items");
      results.push(...data.items.map(item => this.mapToBusiness(item, city, country)));
      logger.info("items pushed into results, new size: " + results.length);

      if (data.items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;

    } while (true);

    logger.info(`HERE Browse: found ${results.length} businesses for "${categoryCode}" in "${cityCountry}"`);
    return results;
  }

  private async resolveCoords(cityCountry: string): Promise<Coordinates> {
    const cached = this.geoCache.get(cityCountry);
    if (cached) {
      logger.debug(`Geocache hit: "${cityCountry}"`);
      return cached;
    }

    logger.debug(`Geocoding: "${cityCountry}"`);
    const url = new URL(HERE_GEOCODE_URL);
    url.searchParams.set('q',      cityCountry);
    url.searchParams.set('apiKey', this.config.here_api_key);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HERE Geocoding failed for "${cityCountry}": HTTP ${response.status}`);

    const data = await response.json() as GeocodeResponse;
    if (!data.items.length) throw new Error(`HERE Geocoding returned no results for "${cityCountry}"`);

    const coords: Coordinates = { lat: data.items[0].position.lat, lng: data.items[0].position.lng };
    this.geoCache.set(cityCountry, coords);
    return coords;
  }

  private parseCityCountry(cityCountry: string): { city: string; country: string } {
    const idx = cityCountry.indexOf(', ');
    return {
      city:    idx !== -1 ? cityCountry.slice(0, idx)  : cityCountry,
      country: idx !== -1 ? cityCountry.slice(idx + 2) : '',
    };
  }

  private mapToBusiness(item: HereItem, city: string, country: string): Business {
    return {
      place_id:     item.id,
      name:         item.title,
      category:     item.categories?.[0]?.name ?? '',
      city,
      country,
      address:      item.address.label ?? '',
      phone:        item.contacts?.[0]?.phone?.[0]?.value,
      website:      item.contacts?.[0]?.www?.[0]?.value,
      rating:       item.rating,
      review_count: item.ratingCount,
      maps_url:     `https://maps.here.com/?q=${encodeURIComponent(item.title)}&map=${item.position.lat},${item.position.lng},15,normal&ref=${encodeURIComponent(item.id)}`,
    };
  }
}