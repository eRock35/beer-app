/**
 * The decision half of `store.reserve()`, shared by both drivers so the rule
 * is written once and can be tested without a database.
 *
 * An entry is `{ collection, id, field, by, limit, base }`: add `by` to
 * `field` on that document, creating it from `base` if it does not exist,
 * unless that would take it past `limit` (null or undefined: no ceiling).
 * Every entry is checked before any is written, so a request refused by one
 * ceiling has spent nothing against another.
 *
 * Returns `{ ok: true, values, writes }` - the new counts, and the documents
 * the driver should write inside its transaction - or `{ ok: false, failed,
 * values }` where `failed` is the index of the first entry over its limit and
 * `values` are the counts as they stood.
 */
export function planReservation(entries, docs) {
  const current = entries.map((e, i) => Number(docs[i]?.[e.field]) || 0);
  for (let i = 0; i < entries.length; i++) {
    const { by, limit } = entries[i];
    if (limit != null && current[i] + by > limit) return { ok: false, failed: i, values: current };
  }
  const now = new Date().toISOString();
  const values = current.map((v, i) => v + entries[i].by);
  const writes = entries.map((e, i) => ({
    ...(docs[i] || e.base || {}),
    [e.field]: values[i],
    id: String(e.id),
    updatedAt: now,
  }));
  return { ok: true, values, writes };
}
