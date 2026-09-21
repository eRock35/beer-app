/**
 * Seeds a demo account so the app is worth looking at before you have logged
 * anything. Safe to re-run: it wipes and rebuilds only the demo user's data.
 *
 * The rows themselves live in domain/sample-journal.js, shared with the sample
 * passport the app can show a signed-in visitor who has logged nothing.
 */
import { initStore, getStore } from './store/index.js';
import { newId } from './lib/ids.js';
import { hashPassword } from './auth.js';
import { SAMPLE_PROFILE, sampleCellar, samplePours, sampleWishlist } from './domain/sample-journal.js';

const DEMO_EMAIL = process.env.SEED_EMAIL || 'demo@hopscotch.beer';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'hopscotch-demo';

async function main() {
  await initStore();
  const store = getStore();

  const [existing] = await store.query('users', { where: [['email', '==', DEMO_EMAIL]], limit: 1 });
  const userId = existing?.id || newId('u_');

  if (existing) {
    for (const collection of ['pours', 'cellar', 'wishlist', 'trips']) {
      for (const row of await store.query(collection, { where: [['userId', '==', userId]] })) {
        await store.delete(collection, row.id);
      }
    }
  }

  await store.put('users', userId, {
    ...SAMPLE_PROFILE,
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    units: 'imperial',
    createdAt: existing?.createdAt || new Date().toISOString(),
  });

  const pours = samplePours({ userId });
  for (const pour of pours) await store.put('pours', newId('p_'), pour);

  const cellar = sampleCellar({ userId });
  for (const bottle of cellar) await store.put('cellar', newId('b_'), bottle);

  const wishlist = sampleWishlist({ userId });
  for (const row of wishlist) await store.put('wishlist', newId('w_'), row);

  console.log(`Seeded ${pours.length} pours, ${cellar.length} cellar entries, ${wishlist.length} wishlist rows.`);
  console.log(`Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await store.close?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
