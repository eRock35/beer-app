#!/usr/bin/env node
/**
 * Creates the composite indexes in firestore.indexes.json.
 *
 * Firestore refuses any query that filters on one field and orders by another
 * unless a matching composite index exists — it does not fall back to a scan.
 * The SQLite driver has no such requirement, so a missing index is invisible
 * until the app is running against Firestore.
 *
 * Auth comes from Application Default Credentials, so run it after
 * `gcloud auth login` or with GOOGLE_APPLICATION_CREDENTIALS set:
 *
 *   PROJECT_ID=your-project DATABASE_ID=hopscotch node deploy/firestore-indexes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DATABASE = process.env.DATABASE_ID || 'hopscotch';
const PREFIX = process.env.FIRESTORE_PREFIX || 'hopscotch';

if (!PROJECT) {
  console.error('Set PROJECT_ID (or GOOGLE_CLOUD_PROJECT).');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(path.join(here, '..', 'firestore.indexes.json'), 'utf8'));
const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
const client = await auth.getClient();

let created = 0;
let existing = 0;

for (const index of spec.indexes) {
  const group = `${PREFIX}_${index.collectionGroup}`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}` +
    `/collectionGroups/${group}/indexes`;

  const body = {
    queryScope: 'COLLECTION',
    fields: index.fields.map(([fieldPath, order]) => ({ fieldPath, order })),
  };

  try {
    await client.request({ url, method: 'POST', data: body });
    console.log(`created  ${group}: ${index.fields.map((f) => f.join(' ')).join(', ')}`);
    created += 1;
  } catch (err) {
    const message = err?.response?.data?.error?.message || err.message;
    // An index that already exists is the desired end state, not a failure.
    if (/already exists/i.test(message)) {
      console.log(`exists   ${group}: ${index.fields.map((f) => f.join(' ')).join(', ')}`);
      existing += 1;
    } else {
      console.error(`FAILED   ${group}: ${message}`);
      process.exitCode = 1;
    }
  }
}

console.log(`\n${created} created, ${existing} already present.`);
console.log('Indexes build in the background; queries against them fail until they are READY.');
