/**
 * Offline state/province data for WIEZ's operating markets, keyed by ISO2.
 *
 * A DELIBERATE cross-repo twin of `fthreadly/src/data/countryRegions.ts`. The
 * two repos cannot import each other, so agreement is asserted by
 * `scripts/test-location-cascade-contract.js` rather than by this comment.
 *
 * Why it exists: the location cascade depends on the free `countriesnow.space`
 * API. When that call fails the service returns `[]`, and every caller renders
 * an empty option list as a DISABLED dropdown — so a third-party outage
 * silently bricks the form: a user picks a country and can then never pick a
 * state, with no error and no way forward. Mobile had no fallback at all.
 *
 * Keyed by ISO2 rather than by name because country names are not stable
 * across sources ("United Kingdom" vs "United Kingdom of Great Britain and
 * Northern Ireland"), and the name is what the user sees, not what we should
 * match on.
 */
export const OFFLINE_COUNTRY_REGIONS: Record<string, string[]> = {
  // 36 states + the Federal Capital Territory.
  NG: [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'Federal Capital Territory',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
  ],
  // 16 regions (post-2019 reorganisation).
  GH: [
    'Ahafo',
    'Ashanti',
    'Bono',
    'Bono East',
    'Central',
    'Eastern',
    'Greater Accra',
    'North East',
    'Northern',
    'Oti',
    'Savannah',
    'Upper East',
    'Upper West',
    'Volta',
    'Western',
    'Western North',
  ],
  // 47 counties.
  KE: [
    'Baringo',
    'Bomet',
    'Bungoma',
    'Busia',
    'Elgeyo-Marakwet',
    'Embu',
    'Garissa',
    'Homa Bay',
    'Isiolo',
    'Kajiado',
    'Kakamega',
    'Kericho',
    'Kiambu',
    'Kilifi',
    'Kirinyaga',
    'Kisii',
    'Kisumu',
    'Kitui',
    'Kwale',
    'Laikipia',
    'Lamu',
    'Machakos',
    'Makueni',
    'Mandera',
    'Marsabit',
    'Meru',
    'Migori',
    'Mombasa',
    "Murang'a",
    'Nairobi',
    'Nakuru',
    'Nandi',
    'Narok',
    'Nyamira',
    'Nyandarua',
    'Nyeri',
    'Samburu',
    'Siaya',
    'Taita-Taveta',
    'Tana River',
    'Tharaka-Nithi',
    'Trans Nzoia',
    'Turkana',
    'Uasin Gishu',
    'Vihiga',
    'Wajir',
    'West Pokot',
  ],
  ZA: [
    'Eastern Cape',
    'Free State',
    'Gauteng',
    'KwaZulu-Natal',
    'Limpopo',
    'Mpumalanga',
    'North West',
    'Northern Cape',
    'Western Cape',
  ],
  GB: ['England', 'Northern Ireland', 'Scotland', 'Wales'],
  US: [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'District of Columbia',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ],
  CA: [
    'Alberta',
    'British Columbia',
    'Manitoba',
    'New Brunswick',
    'Newfoundland and Labrador',
    'Northwest Territories',
    'Nova Scotia',
    'Nunavut',
    'Ontario',
    'Prince Edward Island',
    'Quebec',
    'Saskatchewan',
    'Yukon',
  ],
};

/**
 * Country names we accept as aliases for an ISO2 code, so a lookup still works
 * when all we have is the display name a remote source handed us.
 */
const NAME_TO_ISO2: Record<string, string> = {
  nigeria: 'NG',
  ghana: 'GH',
  kenya: 'KE',
  'south africa': 'ZA',
  'united kingdom': 'GB',
  'united kingdom of great britain and northern ireland': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  england: 'GB',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  canada: 'CA',
};

export const resolveCountryIso2 = (
  countryName?: string,
  iso2?: string,
): string | undefined => {
  const explicit = String(iso2 ?? '')
    .trim()
    .toUpperCase();
  if (explicit.length === 2) return explicit;

  const normalized = String(countryName ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return undefined;
  return NAME_TO_ISO2[normalized];
};

/**
 * Offline regions for a country. Empty array means "we have no bundled data",
 * which callers must treat as "let the user type a value", never as "disable
 * the field".
 */
export const getOfflineRegions = (
  countryName?: string,
  iso2?: string,
): string[] => {
  const code = resolveCountryIso2(countryName, iso2);
  if (!code) return [];
  return OFFLINE_COUNTRY_REGIONS[code] ?? [];
};
