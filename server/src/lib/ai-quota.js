/**
 * What the sommelier may spend, and the one place it is counted.
 *
 * Registration is open and free, so a per-account cap alone bounds nothing:
 * whoever wants more makes another account. Three limits, all in "requests"
 * (a web lookup counts 2, a dispatch scan 3 - see the call sites):
 *
 *  - **Per account, per UTC day.** `AI_DAILY_MESSAGE_LIMIT` (60) for an
 *    account older than a day; `AI_NEW_ACCOUNT_DAILY_LIMIT` (10) for its
 *    first 24 hours, which is what a throwaway account gets. Hopscotch has no
 *    email verification, so age is the only signal there is.
 *  - **Across everyone, per UTC day.** `AI_DAILY_GLOBAL_LIMIT` (400). The
 *    thing that actually bounds the bill: however many accounts exist, one
 *    day cannot spend past it. The scheduled dispatch sweep counts here too.
 *
 * Both are taken in ONE transaction (`store.reserve`), before any model call.
 * The old check read the count and wrote count + 1 as two steps, so twenty
 * requests fired at once all read the same number and all went through.
 * Counter documents live in `ai_usage`: `<userId>_<day>` and `all_<day>`
 * (user ids start `u_`, so the two cannot collide).
 */
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { HttpError } from './http.js';

const HOUR_MS = 60 * 60 * 1000;

export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

/** True for an account in its first `aiNewAccountHours`. A row with no
 *  readable createdAt is treated as new: the smaller allowance is the safe
 *  guess, and every row this app writes has one. */
export function isNewAccount(user, now = Date.now()) {
  const created = Date.parse(user?.createdAt || '');
  return !Number.isFinite(created) || now - created < config.aiNewAccountHours * HOUR_MS;
}

export function dailyLimitFor(user, now = Date.now()) {
  return isNewAccount(user, now) ? config.aiNewAccountDailyLimit : config.aiDailyMessageLimit;
}

const userEntry = (user, day, cost, limit) => ({
  collection: 'ai_usage',
  id: `${user.id}_${day}`,
  field: 'count',
  by: cost,
  limit,
  base: { userId: user.id, day },
});

const globalEntry = (day, cost) => ({
  collection: 'ai_usage',
  id: `all_${day}`,
  field: 'count',
  by: cost,
  limit: config.aiDailyGlobalLimit,
  base: { scope: 'all', day },
});

function userRefusal(user, limit) {
  const first = isNewAccount(user)
    ? ` New accounts get ${limit} a day for their first day, then ${config.aiDailyMessageLimit}.`
    : '';
  return new HttpError(429, `You have used today's ${limit} sommelier requests. It resets at midnight UTC.${first}`);
}

const globalRefusal = () =>
  new HttpError(
    429,
    'The sommelier has answered all it can for today, across everyone. It resets at midnight UTC.'
  );

/**
 * Takes `cost` from both the account's allowance and the day's ceiling, or
 * from neither. Throws a 429 with a sentence when either is spent. Returns
 * what is left of the account's allowance.
 */
export async function reserveAiCalls(user, cost = 1) {
  const day = utcDay();
  const limit = dailyLimitFor(user);
  const result = await getStore().reserve([userEntry(user, day, cost, limit), globalEntry(day, cost)]);
  if (!result.ok) throw result.failed === 0 ? userRefusal(user, limit) : globalRefusal();
  return limit - result.values[0];
}

/** The ceiling alone, for work with no user to bill (the dispatch sweep).
 *  Returns false rather than throwing: a sweep stops, it does not fail. */
export async function reserveGlobalAiCalls(cost = 1) {
  const result = await getStore().reserve([globalEntry(utcDay(), cost)]);
  return result.ok;
}

/**
 * A cheap, non-binding look before the expensive part of a request - reading
 * an 8 MB photo, building the drinker's context. If either count is already
 * at its limit, refuse now. The binding check is still reserveAiCalls(); this
 * only saves work on a request that could never have been answered.
 */
export async function aiQuotaPreflight(user) {
  const day = utcDay();
  const store = getStore();
  const limit = dailyLimitFor(user);
  const [mine, all] = await Promise.all([
    store.get('ai_usage', `${user.id}_${day}`),
    store.get('ai_usage', `all_${day}`),
  ]);
  if ((Number(mine?.count) || 0) >= limit) throw userRefusal(user, limit);
  if ((Number(all?.count) || 0) >= config.aiDailyGlobalLimit) throw globalRefusal();
}
