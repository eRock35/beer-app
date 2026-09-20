import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const OPS = {
  '==': '=',
  '!=': '!=',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
};

/**
 * Document store backed by SQLite. Each collection is one table of
 * `(id TEXT PRIMARY KEY, doc TEXT)` and we query through `json_extract`, which
 * keeps the query surface identical to the Firestore driver.
 */
export function createSqliteStore({ filePath }) {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });

  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const tables = new Set();
  function table(collection) {
    if (!/^[a-z_]+$/.test(collection)) throw new Error(`bad collection name: ${collection}`);
    if (!tables.has(collection)) {
      db.exec(
        `CREATE TABLE IF NOT EXISTS ${collection} (id TEXT PRIMARY KEY, doc TEXT NOT NULL);` +
          `CREATE INDEX IF NOT EXISTS ${collection}_owner ON ${collection} (json_extract(doc, '$.userId'));` +
          `CREATE INDEX IF NOT EXISTS ${collection}_created ON ${collection} (json_extract(doc, '$.createdAt'));`
      );
      tables.add(collection);
    }
    return collection;
  }

  function buildWhere(where = []) {
    const clauses = [];
    const params = [];
    for (const [field, op, value] of where) {
      if (op === 'in') {
        const list = Array.isArray(value) ? value : [value];
        if (list.length === 0) return { sql: ' WHERE 0', params: [] };
        clauses.push(`json_extract(doc, '$.${field}') IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
        continue;
      }
      if (op === 'array-contains') {
        clauses.push(
          `EXISTS (SELECT 1 FROM json_each(doc, '$.${field}') WHERE json_each.value = ?)`
        );
        params.push(value);
        continue;
      }
      const sqlOp = OPS[op];
      if (!sqlOp) throw new Error(`unsupported operator: ${op}`);
      clauses.push(`json_extract(doc, '$.${field}') ${sqlOp} ?`);
      params.push(value === true ? 1 : value === false ? 0 : value);
    }
    return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
  }

  return {
    driver: 'sqlite',

    async get(collection, id) {
      const row = db.prepare(`SELECT doc FROM ${table(collection)} WHERE id = ?`).get(id);
      return row ? JSON.parse(row.doc) : null;
    },

    async put(collection, id, doc) {
      const body = { ...doc, id };
      db.prepare(
        `INSERT INTO ${table(collection)} (id, doc) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET doc = excluded.doc`
      ).run(id, JSON.stringify(body));
      return body;
    },

    async patch(collection, id, changes) {
      const current = await this.get(collection, id);
      if (!current) return null;
      return this.put(collection, id, { ...current, ...changes });
    },

    async delete(collection, id) {
      db.prepare(`DELETE FROM ${table(collection)} WHERE id = ?`).run(id);
    },

    async query(collection, { where = [], orderBy, direction = 'desc', limit } = {}) {
      const w = buildWhere(where);
      let sql = `SELECT doc FROM ${table(collection)}${w.sql}`;
      if (orderBy) {
        sql += ` ORDER BY json_extract(doc, '$.${orderBy}') ${direction === 'asc' ? 'ASC' : 'DESC'}`;
      }
      if (limit) sql += ` LIMIT ${Number(limit)}`;
      return db
        .prepare(sql)
        .all(...w.params)
        .map((r) => JSON.parse(r.doc));
    },

    async count(collection, { where = [] } = {}) {
      const w = buildWhere(where);
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table(collection)}${w.sql}`).get(...w.params);
      return row?.n ?? 0;
    },

    async close() {
      db.close();
    },
  };
}
