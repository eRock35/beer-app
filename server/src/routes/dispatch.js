import { Router } from 'express';
import { z } from 'zod';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { newId } from '../lib/ids.js';
import { badRequest, forbidden, HttpError, notFound, parse, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { anthropic, callClaude, checkQuota } from './ai.js';
import { DISPATCH_SCHEMA, searchWeb } from '../domain/research.js';

const watchSchema = z.object({
  kind: z.enum(['brewery', 'style', 'anything']).default('brewery'),
  // What you are watching for: a brewery name, a style, or empty for "anything good".
  target: z.string().trim().max(160).default(''),
  places: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
      })
    )
    .min(1, 'Watch at least one place.')
    .max(6),
  radiusMiles: z.number().int().min(1).max(500).default(50),
  active: z.boolean().default(true),
  note: z.string().trim().max(400).default(''),
});

const DISPATCH_SYSTEM = `You are a release scout for a craft beer app. You search the open web and report what is genuinely coming to a place.

What counts as a find:
- A dated brewery release, bottle drop, or can release.
- A brewery entering or expanding into a market, or a one-off allocation landing somewhere.
- A festival, tap takeover or bottle share worth planning around.
- A notable taproom or brewery closing, because that is a reason to go now.

Rules that matter more than coverage:
- Only report what a source you actually consulted says. Never infer a release from a brewery's general release pattern, and never invent a date.
- Mark confidence honestly. "confirmed" requires a source stating it outright with a date. If it is a forum post or a rumour, say rumour.
- Prefer the brewery's own site or socials, then local beer press, then retailers. Distributor allocations are rarely published; do not manufacture them.
- Skip anything already past.
- If the search turns up nothing real, return an empty list and say so. An empty result is a correct answer and far more useful than a plausible invention.
- Beer distribution is genuinely poorly documented on the web. Under-reporting is the right failure mode here.`;

/** Turn one watch into a search brief. */
function briefFor(watch, user) {
  const places = watch.places.map((p) => p.label).join(', ');
  const subject =
    watch.kind === 'brewery'
      ? `the brewery "${watch.target}"`
      : watch.kind === 'style'
        ? `notable ${watch.target} releases`
        : 'notable craft beer releases';

  return [
    `Search for upcoming or very recent news about ${subject} relevant to: ${places}.`,
    `Look roughly ${watch.radiusMiles} miles around each place.`,
    `Today is ${new Date().toISOString().slice(0, 10)}. Only report things still ahead or from the last week.`,
    watch.note ? `The drinker added: ${watch.note}` : null,
    user?.homeCity ? `Their home base is ${user.homeCity}${user.homeState ? `, ${user.homeState}` : ''}.` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Runs one watch: a search-backed pass, then a cheap structuring pass. Two
 * calls because structured output and the search tool are happier apart, and
 * because it keeps the sources verifiable — the structurer can only cite URLs
 * the searcher actually visited.
 */
async function runWatch(watch, user) {
  const client = anthropic();

  const { text, sources, searched } = await callClaude(() =>
    searchWeb(client, {
      model: config.anthropicModel,
      system: DISPATCH_SYSTEM,
      prompt: briefFor(watch, user),
      maxUses: 6,
      maxTokens: 8000,
    })
  );

  if (!text) {
    return { finds: [], summary: 'The search came back empty.', sources, searched };
  }

  const structured = await callClaude(() =>
    client.messages.parse({
      model: config.anthropicModel,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: jsonSchemaOutputFormat(DISPATCH_SCHEMA) },
      system:
        'Convert a research note into structured findings. Carry over only what the note actually states — do not add, upgrade a rumour to confirmed, or invent a date or a URL. Every sourceUrl must be one of the URLs listed as consulted, or null.',
      messages: [
        {
          role: 'user',
          content: `Research note:\n${text}\n\nURLs consulted:\n${
            sources.map((s) => `- ${s.url}`).join('\n') || '(none)'
          }`,
        },
      ],
    })
  );

  const parsed = structured.parsed_output || { finds: [], summary: text.slice(0, 400) };
  const allowed = new Set(sources.map((s) => s.url));

  return {
    // Drop any citation the searcher did not actually visit.
    finds: (parsed.finds || []).map((f) => ({
      ...f,
      sourceUrl: f.sourceUrl && allowed.has(f.sourceUrl) ? f.sourceUrl : null,
    })),
    summary: parsed.summary || '',
    sources,
    searched,
  };
}

/** Stable key so re-scanning does not pile up duplicates of the same news. */
const findKey = (watchId, find) =>
  `${watchId}:${(find.headline || '').toLowerCase().replace(/\W+/g, '-').slice(0, 80)}`;

async function persistFinds(userId, watch, result) {
  const store = getStore();
  const existing = await store.query('dispatch_finds', {
    where: [['watchId', '==', watch.id]],
    limit: 200,
  });
  const seen = new Set(existing.map((f) => f.key));

  const fresh = [];
  for (const find of result.finds) {
    const key = findKey(watch.id, find);
    if (seen.has(key)) continue;
    fresh.push(
      await store.put('dispatch_finds', newId('df_'), {
        ...find,
        key,
        userId,
        watchId: watch.id,
        watchLabel: watch.target || 'anything good',
        dismissed: false,
        read: false,
        foundAt: new Date().toISOString(),
      })
    );
  }
  return fresh;
}

export const dispatchRouter = Router();

/* ---- the cron entry point sits before requireUser, guarded by its own secret ---- */

/**
 * Scans every active watch across all users. Meant for Cloud Scheduler:
 *   gcloud scheduler jobs create http hopscotch-dispatch \
 *     --schedule="0 14 * * 1" --uri="$URL/api/dispatch/cron" \
 *     --http-method=POST --headers="x-cron-secret=..."
 */
dispatchRouter.post(
  '/cron',
  wrap(async (req, res) => {
    if (!config.cronSecret) throw new HttpError(503, 'No CRON_SECRET configured on this deployment.');
    if (req.get('x-cron-secret') !== config.cronSecret) throw forbidden('Bad cron secret.');
    if (!config.aiEnabled) throw new HttpError(503, 'The sommelier is off, so there is nothing to scan with.');

    const store = getStore();
    const all = await store.query('dispatch_watches', {
      where: [['active', '==', true]],
      limit: 200,
    });

    // Oldest-scanned first, so a capped sweep works its way round rather than
    // repeatedly scanning the same few watches and starving the rest.
    const ordered = [...all].sort((a, b) => (a.lastScanAt || '').localeCompare(b.lastScanAt || ''));
    const cap = config.dispatchMaxWatchesPerSweep;
    const watches = ordered.slice(0, cap);
    const deferred = ordered.length - watches.length;

    const report = [];
    for (const watch of watches) {
      try {
        const user = await store.get('users', watch.userId);
        const result = await runWatch(watch, user);
        const fresh = await persistFinds(watch.userId, watch, result);
        await store.patch('dispatch_watches', watch.id, { lastScanAt: new Date().toISOString() });
        report.push({ watchId: watch.id, found: fresh.length });
      } catch (err) {
        // One bad watch must not abort the whole sweep.
        console.error('[hopscotch] dispatch watch failed', watch.id, err?.message);
        report.push({ watchId: watch.id, error: err?.message || 'failed' });
      }
    }

    if (deferred > 0) {
      console.warn(`[hopscotch] dispatch sweep capped at ${cap}; ${deferred} watch(es) deferred`);
    }
    res.json({ scanned: watches.length, deferred, cap, report });
  })
);

dispatchRouter.use(requireUser);

dispatchRouter.get(
  '/',
  wrap(async (req, res) => {
    const store = getStore();
    const [watches, finds] = await Promise.all([
      store.query('dispatch_watches', {
        where: [['userId', '==', req.user.id]],
        orderBy: 'createdAt',
        direction: 'desc',
        limit: 50,
      }),
      store.query('dispatch_finds', {
        where: [['userId', '==', req.user.id]],
        orderBy: 'foundAt',
        direction: 'desc',
        limit: 100,
      }),
    ]);
    res.json({ watches, finds: finds.filter((f) => !f.dismissed), aiEnabled: config.aiEnabled });
  })
);

dispatchRouter.post(
  '/watches',
  wrap(async (req, res) => {
    const input = parse(watchSchema, req.body);
    if (input.kind !== 'anything' && !input.target) {
      throw badRequest('Say what you are watching for.');
    }
    const watch = await getStore().put('dispatch_watches', newId('dw_'), {
      ...input,
      userId: req.user.id,
      lastScanAt: null,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ watch });
  })
);

dispatchRouter.patch(
  '/watches/:id',
  wrap(async (req, res) => {
    const store = getStore();
    const existing = await store.get('dispatch_watches', req.params.id);
    if (!existing) throw notFound();
    if (existing.userId !== req.user.id) throw forbidden();
    const input = parse(watchSchema, { ...existing, ...req.body });
    res.json({ watch: await store.put('dispatch_watches', existing.id, { ...existing, ...input }) });
  })
);

dispatchRouter.delete(
  '/watches/:id',
  wrap(async (req, res) => {
    const store = getStore();
    const existing = await store.get('dispatch_watches', req.params.id);
    if (!existing) throw notFound();
    if (existing.userId !== req.user.id) throw forbidden();
    await store.delete('dispatch_watches', existing.id);
    for (const f of await store.query('dispatch_finds', { where: [['watchId', '==', existing.id]] })) {
      await store.delete('dispatch_finds', f.id);
    }
    res.json({ ok: true });
  })
);

/** Scan one watch now. */
dispatchRouter.post(
  '/watches/:id/scan',
  wrap(async (req, res) => {
    const store = getStore();
    const watch = await store.get('dispatch_watches', req.params.id);
    if (!watch) throw notFound();
    if (watch.userId !== req.user.id) throw forbidden();

    anthropic();
    // A scan is a search pass plus a structuring pass.
    await checkQuota(req.user.id, 3);

    const result = await runWatch(watch, req.user);
    const fresh = await persistFinds(req.user.id, watch, result);
    await store.patch('dispatch_watches', watch.id, { lastScanAt: new Date().toISOString() });

    res.json({
      summary: result.summary,
      sources: result.sources,
      searched: result.searched,
      finds: fresh,
      newCount: fresh.length,
    });
  })
);

dispatchRouter.patch(
  '/finds/:id',
  wrap(async (req, res) => {
    const store = getStore();
    const find = await store.get('dispatch_finds', req.params.id);
    if (!find) throw notFound();
    if (find.userId !== req.user.id) throw forbidden();
    const input = parse(
      z.object({ dismissed: z.boolean().optional(), read: z.boolean().optional() }),
      req.body
    );
    res.json({ find: await store.patch('dispatch_finds', find.id, input) });
  })
);
