// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — GoogleFetcher
//  Fetches real business data from Google Places API (Text Search)
// ─────────────────────────────────────────────────────────────────────────────

import { Client, TextSearchRequest, PlaceData } from '@googlemaps/google-maps-services-js';
import { Business } from './Business';
import { Config } from '../config/ConfigLoader';
import logger from '../logger';

export class GoogleFetcher {
  private client: Client;
  private apiKey: string;

  constructor(private config: Config) {
    this.client = new Client();
    this.apiKey = config.google_api_key;
  }

  /**
   * Fetches businesses for all (category × city) combinations in config.
   * Returns at most config.results_per_run unique businesses.
   */
  async fetchAll(): Promise<Business[]> {
    const results: Business[] = [];

    for (const category of this.config.categories) {
      for (const city of this.config.cities) {
        if (results.length >= this.config.results_per_run) break;

        const remaining = this.config.results_per_run - results.length;
        const batch = await this.fetchOne(category, city, remaining);
        results.push(...batch);
      }
      if (results.length >= this.config.results_per_run) break;
    }

    return results.slice(0, this.config.results_per_run);
  }

  /**
   * Fetches businesses for a single (category, city) pair.
   * Returns an empty array on API error — never throws.
   */
  async fetchOne(category: string, city: string, limit: number): Promise<Business[]> {
    const query = `${category} in ${city}, ${this.config.countries[0] ?? ''}`;

    logger.debug(`Fetching: "${query}"`);

    try {
      const request: TextSearchRequest = {
        params: {
          query,
          key: this.apiKey,
        },
      };

      const response = await this.client.textSearch(request);
      const places = response.data.results.slice(0, limit);

      return places
        .filter((place): place is Partial<PlaceData> & { place_id: string; name: string } =>
          Boolean(place.place_id && place.name)
        )
        .map(place => this.mapToBusinessModel(place, category, city));

    } catch (err) {
      logger.error(`Google Places API error for "${query}": ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Maps a raw Google Places result to the internal Business model.
   */
  private mapToBusinessModel(
    place: Partial<PlaceData> & { place_id: string; name: string },
    category: string,
    city: string
  ): Business {
    return {
      place_id:     place.place_id,
      name:         place.name,
      category,
      city,
      country:      this.config.countries[0] ?? '',
      address:      place.formatted_address ?? '',
      phone:        place.formatted_phone_number,
      website:      place.website,
      rating:       place.rating,
      review_count: place.user_ratings_total,
      maps_url:     `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
    };
  }
}