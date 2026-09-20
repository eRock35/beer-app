import { config } from '../config.js';

/**
 * Collections are declared here so the SQLite driver can create their tables up
 * front and so there is one list to look at when reasoning about the data model.
 */
export const COLLECTIONS = [
  'users',
  'pours',
  'cheers',
  'comments',
  'wishlist',
  'cellar',
  'trips',
  'follows',
  'ai_usage',
  'dispatch_watches',
  'dispatch_finds',
];

let store;

export async function initStore() {
  if (store) return store;

  // Both drivers are imported lazily. That keeps the GCP client off the path in
  // local dev, and — more importantly — keeps better-sqlite3, a native addon,
  // out of the production path entirely, so a Firestore deployment does not
  // depend on it having compiled.
  if (config.dbDriver === 'firestore') {
    const { createFirestoreStore } = await import('./firestore.js');
    store = createFirestoreStore({
      projectId: config.firestoreProjectId,
      prefix: config.firestoreCollectionPrefix,
    });
  } else {
    const { createSqliteStore } = await import('./sqlite.js');
    store = createSqliteStore({ filePath: config.sqlitePath });
    // Touch every collection so the tables and indexes exist before first read.
    for (const c of COLLECTIONS) await store.count(c);
  }

  return store;
}

export function getStore() {
  if (!store) throw new Error('store not initialised — call initStore() first');
  return store;
}
