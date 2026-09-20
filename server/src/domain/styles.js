/**
 * A working style list — grouped the way a taproom menu is, not the way the
 * BJCP is. `family` drives the passport stats and the badge engine.
 */
export const STYLE_FAMILIES = {
  stout: 'Stout & Porter',
  ipa: 'IPA',
  paleAle: 'Pale & Amber Ale',
  lager: 'Lager & Pilsner',
  wheat: 'Wheat & Witbier',
  belgian: 'Belgian & Farmhouse',
  sour: 'Sour & Wild',
  strong: 'Strong & Barleywine',
  specialty: 'Specialty & Other',
};

export const STYLES = [
  ['Imperial Stout', 'stout'], ['Barrel-Aged Imperial Stout', 'stout'], ['Pastry Stout', 'stout'],
  ['Oatmeal Stout', 'stout'], ['Dry Irish Stout', 'stout'], ['Milk Stout', 'stout'],
  ['Baltic Porter', 'stout'], ['Porter', 'stout'], ['Schwarzbier', 'stout'],
  ['Hazy IPA', 'ipa'], ['West Coast IPA', 'ipa'], ['Double IPA', 'ipa'], ['Triple IPA', 'ipa'],
  ['Session IPA', 'ipa'], ['Cold IPA', 'ipa'], ['Black IPA', 'ipa'], ['Brut IPA', 'ipa'],
  ['Pale Ale', 'paleAle'], ['American Amber', 'paleAle'], ['ESB', 'paleAle'],
  ['English Bitter', 'paleAle'], ['Red Ale', 'paleAle'], ['Brown Ale', 'paleAle'],
  ['Pilsner', 'lager'], ['Czech Pale Lager', 'lager'], ['Helles', 'lager'], ['Märzen', 'lager'],
  ['Vienna Lager', 'lager'], ['Dunkel', 'lager'], ['Bock', 'lager'], ['Doppelbock', 'lager'],
  ['Italian Pilsner', 'lager'], ['Light Lager', 'lager'], ['Kellerbier', 'lager'],
  ['Hefeweizen', 'wheat'], ['Witbier', 'wheat'], ['American Wheat', 'wheat'],
  ['Dunkelweizen', 'wheat'], ['Weizenbock', 'wheat'],
  ['Saison', 'belgian'], ['Farmhouse Ale', 'belgian'], ['Belgian Tripel', 'belgian'],
  ['Belgian Dubbel', 'belgian'], ['Belgian Quadrupel', 'belgian'], ['Belgian Blonde', 'belgian'],
  ['Bière de Garde', 'belgian'], ['Grisette', 'belgian'],
  ['Gose', 'sour'], ['Berliner Weisse', 'sour'], ['Lambic', 'sour'], ['Gueuze', 'sour'],
  ['Flanders Red', 'sour'], ['Oud Bruin', 'sour'], ['American Wild Ale', 'sour'],
  ['Fruited Sour', 'sour'], ['Kettle Sour', 'sour'],
  ['Barleywine', 'strong'], ['Old Ale', 'strong'], ['Wheatwine', 'strong'],
  ['Scotch Ale / Wee Heavy', 'strong'], ['Barrel-Aged Barleywine', 'strong'],
  ['Fruit Beer', 'specialty'], ['Smoked / Rauchbier', 'specialty'], ['Kölsch', 'specialty'],
  ['Altbier', 'specialty'], ['Cream Ale', 'specialty'], ['Cider', 'specialty'],
  ['Mead', 'specialty'], ['Non-Alcoholic', 'specialty'], ['Other', 'specialty'],
].map(([name, family]) => ({ name, family }));

const byName = new Map(STYLES.map((s) => [s.name.toLowerCase(), s]));

export function familyOf(styleName) {
  if (!styleName) return 'specialty';
  const exact = byName.get(String(styleName).toLowerCase());
  if (exact) return exact.family;
  const s = String(styleName).toLowerCase();
  if (/stout|porter|schwarz/.test(s)) return 'stout';
  if (/ipa|hazy|hop/.test(s)) return 'ipa';
  if (/sour|gose|lambic|gueuze|berliner|wild|funk/.test(s)) return 'sour';
  if (/lager|pils|helles|bock|märzen|marzen|dunkel|vienna/.test(s)) return 'lager';
  if (/wheat|weizen|wit/.test(s)) return 'wheat';
  if (/saison|tripel|dubbel|quad|belgian|farmhouse/.test(s)) return 'belgian';
  if (/barleywine|wee heavy|old ale|strong/.test(s)) return 'strong';
  if (/pale ale|amber|bitter|esb|brown/.test(s)) return 'paleAle';
  return 'specialty';
}

/** Flavour vocabulary offered as chips, so notes stay searchable. */
export const FLAVOUR_TAGS = [
  'citrus', 'tropical', 'stone fruit', 'berry', 'melon', 'pine', 'resin', 'dank',
  'grassy', 'floral', 'herbal', 'earthy', 'spicy', 'peppery', 'clove', 'banana',
  'bready', 'biscuit', 'cracker', 'toasty', 'caramel', 'toffee', 'honey',
  'chocolate', 'cocoa nib', 'coffee', 'espresso', 'roast', 'burnt', 'smoke',
  'vanilla', 'coconut', 'oak', 'bourbon', 'whiskey', 'rum', 'sherry', 'port',
  'leather', 'tobacco', 'molasses', 'dark fruit', 'raisin', 'fig', 'plum',
  'lactic', 'acetic', 'funk', 'brett', 'barnyard', 'horse blanket', 'tart',
  'lemon', 'lime', 'salt', 'minerally', 'creamy', 'silky', 'pillowy', 'crisp',
  'dry finish', 'lingering bitterness', 'boozy', 'hot', 'thin', 'astringent',
  'oxidised', 'buttery', 'metallic', 'soapy',
];
