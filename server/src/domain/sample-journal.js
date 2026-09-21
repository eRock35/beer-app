/**
 * A worked-example journal.
 *
 * `npm run seed` writes this into a demo account, and /api/passport/sample
 * computes a passport from it without writing anything at all - so someone who
 * has logged nothing can still see what the Passport is for. One copy of the
 * data, because a sample that has drifted from the seed is worse than no
 * sample: the screenshot stops matching the app.
 */
import { snobScore, verdict } from './scoring.js';
import { familyOf } from './styles.js';

export const POURS = [
  ['Beer: Barrel Aged', 'Side Project Brewing', 'Barrel-Aged Imperial Stout', 13.4, 'Maplewood', 'MO',
    { aroma: 9.5, appearance: 9, flavour: 9.5, mouthfeel: 9, overall: 9.5 },
    ['bourbon', 'vanilla', 'oak', 'dark fruit', 'coconut'],
    'Poured opaque with a mocha head that hung around longer than it had any right to. Bourbon is present but integrated — no heat spike, no solvent. Coconut and vanilla off the oak, then a long fig and molasses finish. This is the one I measure other barrel-aged stouts against.'],
  ['Fuzzy Baby Ducks', 'Wiseacre Brewing', 'West Coast IPA', 6.2, 'Memphis', 'TN',
    { aroma: 8, appearance: 7.5, flavour: 8, mouthfeel: 7.5, overall: 8 },
    ['citrus', 'pine', 'grapefruit', 'dry finish'],
    'Citra doing exactly what Citra does. Bright grapefruit, clean bitterness, finishes dry enough to want another. Unfussy and very good.'],
  ['Pilsner', 'Side Project Brewing', 'Pilsner', 5.1, 'Maplewood', 'MO',
    { aroma: 8, appearance: 8.5, flavour: 8.5, mouthfeel: 8, overall: 8.5 },
    ['cracker', 'floral', 'minerally', 'crisp'],
    'Nowhere to hide in a pilsner and they clearly know it. Cracker malt, a floral hop lift, mineral finish. Beautifully clean.'],
  ['Fundamental Observation', 'Fremont Brewing', 'Barrel-Aged Imperial Stout', 14.5, 'Seattle', 'WA',
    { aroma: 9, appearance: 9, flavour: 9, mouthfeel: 9.5, overall: 9 },
    ['vanilla', 'bourbon', 'chocolate', 'creamy'],
    'Vanilla forward in the best way. Mouthfeel is the headline — genuinely viscous without being syrupy.'],
  ['Hop Drop N Roll', 'NoDa Brewing', 'Double IPA', 7.2, 'Charlotte', 'NC',
    { aroma: 8, appearance: 7, flavour: 7.5, mouthfeel: 7, overall: 7.5 },
    ['tropical', 'pine', 'resin'],
    'Held up better than I expected for a can I found on a work trip. Resinous, a little dated on the aroma.'],
  ['Zwickel', 'Urban Chestnut', 'Kellerbier', 5.0, 'St. Louis', 'MO',
    { aroma: 7.5, appearance: 8, flavour: 8, mouthfeel: 8, overall: 8 },
    ['bready', 'herbal', 'crisp'],
    'The correct answer to a Tuesday. Unfiltered, soft, faintly herbal.'],
  ['Marshmallow Handjee', '3 Floyds', 'Barrel-Aged Imperial Stout', 15.0, 'Munster', 'IN',
    { aroma: 9, appearance: 8.5, flavour: 8.5, mouthfeel: 9, overall: 8.5 },
    ['vanilla', 'boozy', 'chocolate', 'creamy'],
    'Enormous. Vanilla and marshmallow are not subtle, and the booze shows. Impressive rather than drinkable.'],
  ['Cuvée René', 'Lindemans', 'Gueuze', 6.0, 'Vlezenbeek', '',
    { aroma: 9, appearance: 8, flavour: 9, mouthfeel: 8.5, overall: 9 },
    ['funk', 'lemon', 'brett', 'tart', 'barnyard'],
    'Proper gueuze. Lemon rind, hay, a little horse blanket, bone dry. Resets the palate completely.'],
  ['Tropicália', 'Creature Comforts', 'Hazy IPA', 6.6, 'Athens', 'GA',
    { aroma: 8.5, appearance: 8, flavour: 8.5, mouthfeel: 8, overall: 8.5 },
    ['tropical', 'mango', 'citrus', 'pillowy'],
    'The hazy that converted a lot of sceptics, and it still holds up. Mango and orange, soft but not muddy.'],
  ['Mango Cart', 'Golden Road', 'Fruit Beer', 4.0, 'Los Angeles', 'CA',
    { aroma: 5, appearance: 6, flavour: 4, mouthfeel: 5, overall: 4 },
    ['mango', 'thin'],
    'Tastes like mango-adjacent sparkling water. Fine by a pool, not worth a tap handle.'],
  ['Slice of Heaven', 'Southern Grist', 'Pastry Stout', 11.0, 'Nashville', 'TN',
    { aroma: 7, appearance: 8, flavour: 6.5, mouthfeel: 8, overall: 6.5 },
    ['vanilla', 'buttery', 'creamy'],
    'A dessert that forgot to be a beer. Technically well made, but I could not finish it.'],
  ['Saison Dupont', 'Brasserie Dupont', 'Saison', 6.5, 'Tourpes', '',
    { aroma: 9, appearance: 8.5, flavour: 9, mouthfeel: 8.5, overall: 9.5 },
    ['peppery', 'floral', 'earthy', 'dry finish', 'lemon'],
    'The reference point. Pepper, lemon, a dry chalky finish, and it gets better as it warms.'],
];

export const CELLAR = [
  ['Beer: Barrel Aged', 'Side Project Brewing', 'Barrel-Aged Imperial Stout', 13.4, 2024, 2, '2026-01-01', '2029-12-31', 'Bought two so I can open one early and still be patient.'],
  ['Fundamental Observation', 'Fremont Brewing', 'Barrel-Aged Imperial Stout', 14.5, 2023, 1, '2025-06-01', '2028-06-01', ''],
  ['Cuvée René', 'Lindemans', 'Gueuze', 6.0, 2022, 3, '2024-01-01', '2032-01-01', 'Gueuze rewards waiting. No rush.'],
  ['Bigfoot', 'Sierra Nevada', 'Barleywine', 9.6, 2021, 4, '2023-01-01', '2027-01-01', 'Vertical in progress.'],
];

export const WISHLIST = [
  ['Russian River Brewing', 'Santa Rosa', 'CA', 'white-whale', 'Pliny fresh, on site. Non-negotiable.'],
  ['Hill Farmstead Brewery', 'Greensboro Bend', 'VT', 'white-whale', 'Worth building a trip around.'],
  ['Casey Brewing and Blending', 'Glenwood Springs', 'CO', 'next-trip', 'Denver work trip — rent a car.'],
  ['Cantillon', 'Brussels', '', 'someday', 'If a conference ever sends me to Belgium.'],
  ['Suarez Family Brewery', 'Livingston', 'NY', 'someday', 'Country beer and lagers done right.'],
];

/** The seed's own account details, so the sample passport earns the home-brewery badge. */
export const SAMPLE_PROFILE = {
  displayName: 'The Demo Snob',
  homeCity: 'St. Louis',
  homeState: 'MO',
  homeBreweryName: 'Stout Brothers',
  homeBreweryId: '',
  whiteWhaleBrewery: 'Side Project Brewing',
};

/**
 * The pour documents the rows above describe, dated backwards from `now` so the
 * trend line has shape. `userId` is the caller's business: the seed sets a real
 * one, the sample passport leaves it empty because nothing is stored.
 */
export function samplePours({ now = Date.now(), userId = '' } = {}) {
  return POURS.map((row, i) => {
    const [beerName, brewery, style, abv, city, state, scores, tags, notes] = row;
    const score = snobScore(scores);
    const drankAt = new Date(now - (i * 9 + 2) * 86400000).toISOString();
    return {
      userId, beerName, brewery, breweryId: '', style, abv, ibu: null,
      servingFormat: i % 3 === 0 ? 'draft' : 'can',
      scores, tags, notes, photoUrl: '',
      city, state, country: state ? 'US' : '', lat: null, lng: null,
      visibility: 'public', score, verdict: verdict(score).label, family: familyOf(style),
      drankAt, createdAt: drankAt, updatedAt: drankAt,
    };
  });
}

/** Bottles in the sample cellar, as documents. */
export function sampleCellar({ userId = '' } = {}) {
  return CELLAR.map(([beerName, brewery, style, abv, vintage, quantity, drinkFrom, drinkBy, notes]) => ({
    userId, beerName, brewery, style, abv, vintage, quantity, drinkFrom, drinkBy, notes,
    createdAt: new Date().toISOString(),
  }));
}

/** Breweries on the sample wishlist, as documents. */
export function sampleWishlist({ userId = '' } = {}) {
  return WISHLIST.map(([breweryName, city, state, priority, note]) => ({
    userId, breweryId: '', breweryName, city, state, lat: null, lng: null, note, priority,
    createdAt: new Date().toISOString(),
  }));
}
