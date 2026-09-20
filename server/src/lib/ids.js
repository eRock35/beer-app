import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short, sortable-ish, URL-safe id. Time prefix keeps natural ordering readable. */
export function newId(prefix = '') {
  const time = Date.now().toString(36).padStart(9, '0');
  const bytes = crypto.randomBytes(8);
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${prefix}${time}${rand}`;
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
