// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — Business model
// ─────────────────────────────────────────────────────────────────────────────

export interface Business {
  place_id: string;         // deduplication key — stable and unique per Google Maps entry
  name: string;
  category: string;         // as configured, not Google's own classification
  city: string;
  country: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  maps_url: string;         // https://www.google.com/maps/place/?q=place_id:...
  first_seen?: string;      // ISO timestamp — set by DedupService.markSeen() on first detection, never overwritten
  last_seen?: string;       // ISO timestamp — updated by DedupService.markSeen() on every run
}

export interface Metadata {
  key: string;              // see MetadataKey enum
  value: string;
  source?: string;          // 'google' | 'manual' | 'enrichment_api'
  collected_at?: string;    // ISO timestamp
}

export interface EnrichedBusiness extends Business {
  metadata: Metadata[];
}

export enum MetadataKey {
  EMAIL         = 'email',
  LINKEDIN_URL  = 'linkedin_url',
  AD_BUDGET_EUR = 'ad_budget_eur',
  LAST_SEEN     = 'last_seen',
  NOTES         = 'notes',
}
