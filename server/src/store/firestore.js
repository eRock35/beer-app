import { Firestore } from '@google-cloud/firestore';

/**
 * Same document-store contract as the SQLite driver, on Firestore. Auth comes
 * from Application Default Credentials — on Cloud Run that is the runtime
 * service account, so no key file ever has to ship with the image.
 */
export function createFirestoreStore({ projectId, prefix = 'hopscotch' }) {
  const db = new Firestore(projectId ? { projectId } : {});
  const col = (name) => db.collection(`${prefix}_${name}`);

  const stripUndefined = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  return {
    driver: 'firestore',

    async get(collection, id) {
      const snap = await col(collection).doc(String(id)).get();
      return snap.exists ? { ...snap.data(), id: snap.id } : null;
    },

    async put(collection, id, doc) {
      const body = stripUndefined({ ...doc, id });
      await col(collection).doc(String(id)).set(body);
      return body;
    },

    async patch(collection, id, changes) {
      const ref = col(collection).doc(String(id));
      const snap = await ref.get();
      if (!snap.exists) return null;
      const body = stripUndefined({ ...snap.data(), ...changes, id: snap.id });
      await ref.set(body);
      return body;
    },

    async delete(collection, id) {
      await col(collection).doc(String(id)).delete();
    },

    async query(collection, { where = [], orderBy, direction = 'desc', limit } = {}) {
      let q = col(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      if (orderBy) q = q.orderBy(orderBy, direction === 'asc' ? 'asc' : 'desc');
      if (limit) q = q.limit(limit);
      const snap = await q.get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },

    async count(collection, { where = [] } = {}) {
      let q = col(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      const snap = await q.count().get();
      return snap.data().count;
    },

    async close() {
      await db.terminate();
    },
  };
}
