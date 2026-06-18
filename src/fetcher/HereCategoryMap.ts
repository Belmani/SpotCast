// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — HereCategoryMap
//  Maps human-readable English category labels to HERE category codes.
//
//  Usage:
//    import { HERE_CATEGORY_MAP, resolveCategory } from './HereCategoryMap';
//
//  Config.json uses labels ("Bar", "Gym") — never codes.
//  ConfigLoader resolves labels to codes before passing to HereFetcher.
// ─────────────────────────────────────────────────────────────────────────────

export const HERE_CATEGORY_MAP: Record<string, string> = {
  // ── Food & Drink ──────────────────────────────────────────────────────────
  "Bar":              "100-1000-0000",
  "Pub":              "100-1000-0000",
  "Restaurant":       "100-1100-0000",
  "Cafe":             "100-1100-0100",
  "Fast Food":        "100-1100-0052",
  "Bakery":           "100-1100-0006",
  "Ice Cream":        "100-1100-0055",
  "Pizzeria":         "100-1100-0062",

  // ── Health & Body ─────────────────────────────────────────────────────────
  "Pharmacy":         "600-6300-0066",
  "Hospital":         "600-6100-0000",
  "Dentist":          "600-6100-0062",
  "Doctor":           "600-6100-0058",
  "Optician":         "600-6300-0079",
  "Gym":              "400-4100-0141",
  "Hairdresser":      "600-6950-0000",
  "Beauty Salon":     "600-6950-0061",
  "Tattoo":           "600-6950-0167",

  // ── Professional Services ─────────────────────────────────────────────────
  "Lawyer":           "700-7400-0246",
  "Accountant":       "700-7400-0244",
  "Notary":           "700-7400-0253",
  "Insurance":        "700-7000-0107",
  "Bank":             "700-7010-0000",
  "Real Estate":      "700-7400-0255",
  "Architect":        "700-7400-0131",
  "Marketing Agency": "700-7400-0168",

  // ── Home & Trades ─────────────────────────────────────────────────────────
  "Plumber":          "700-7400-0249",
  "Locksmith":        "700-7400-0116",
  "Electrician":      "700-7400-0118",
  "Carpenter":        "700-7400-0248",
  "Painter":          "700-7400-0247",
  "Flooring":         "700-7400-0245",
  "Cleaning":         "700-7400-0136",
  "Moving":           "700-7400-0157",
  "HVAC":             "700-7400-0111",

  // ── Automotive ────────────────────────────────────────────────────────────
  "Car Repair":       "700-7600-0116",
  "Car Wash":         "700-7600-0110",
  "Gas Station":      "700-7600-0116",
  "Tires":            "700-7600-0160",
  "Auto Parts":       "700-7600-0101",

  // ── Retail ────────────────────────────────────────────────────────────────
  "Supermarket":      "600-6300-0000",
  "Clothing":         "600-6800-0000",
  "Electronics":      "600-6900-0000",
  "Florist":          "600-6800-0155",
  "Bookstore":        "600-6800-0141",
  "Sports":           "600-6800-0248",
  "Furniture":        "600-6800-0161",
  "Pet Shop":         "600-6300-0090",
  "Toy Store":        "600-6800-0260",

  // ── Accommodation & Travel ────────────────────────────────────────────────
  "Hotel":            "500-5000-0000",
  "Hostel":           "500-5000-0053",
  "B&B":              "500-5000-0008",
  "Travel Agency":    "700-7400-0165",

  // ── Education ─────────────────────────────────────────────────────────────
  "School":           "800-8200-0000",
  "University":       "800-8200-0171",
  "Language School":  "800-8200-0108",
  "Driving School":   "800-8200-0177",
  "Tutoring":         "800-8200-0168",

  // ── Entertainment & Leisure ───────────────────────────────────────────────
  "Cinema":           "200-2100-0000",
  "Theatre":          "200-2100-0166",
  "Museum":           "200-2100-0070",
  "Art Gallery":      "200-2100-0137",
  "Bowling":          "400-4000-0000",
  "Nightclub":        "200-2200-0000",
  "Escape Room":      "400-4000-0000",

  // ── Logistics & Business ──────────────────────────────────────────────────
  "Print Shop":       "700-7400-0161",
  "Photography":      "700-7400-0158",
  "IT Services":      "700-7400-0243",
  "Courier":          "700-7450-0000",
  "Post Office":      "700-7450-0064",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the HERE category code for a given label.
 * Returns undefined if the label is not in the map.
 */
export function resolveCategory(label: string): string | undefined {
  return HERE_CATEGORY_MAP[label];
}

/**
 * Returns all supported category labels, sorted alphabetically.
 */
export function listCategories(): string[] {
  return Object.keys(HERE_CATEGORY_MAP).sort();
}