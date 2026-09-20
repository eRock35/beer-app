import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { HttpError, parse, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { AXES } from '../domain/scoring.js';
import {
  ALLOWED_IMAGE_TYPES,
  decodeImagePayload,
  SCAN_SCHEMA,
  SCAN_SYSTEM,
} from '../domain/vision.js';
import { searchWeb } from '../domain/research.js';

/**
 * The API key lives only in this process. The browser never sees it, never
 * receives it in a response, and every route here is behind requireUser — so an
 * unauthenticated visitor cannot spend the account's tokens.
 */
let client;
function anthropic() {
  if (!config.anthropicApiKey) {
    throw new HttpError(
      503,
      'The sommelier is off. Set ANTHROPIC_API_KEY on the server to switch it on.'
    );
  }
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/** Per-user daily cap, so one runaway tab cannot drain the account. */
async function checkQuota(userId, cost = 1) {
  const store = getStore();
  const day = new Date().toISOString().slice(0, 10);
  const id = `${userId}_${day}`;
  const row = (await store.get('ai_usage', id)) || { userId, day, count: 0 };
  if (row.count + cost > config.aiDailyMessageLimit) {
    throw new HttpError(
      429,
      `You have used today's ${config.aiDailyMessageLimit} sommelier requests. It resets at midnight UTC.`
    );
  }
  await store.put('ai_usage', id, {
    ...row,
    count: row.count + cost,
    updatedAt: new Date().toISOString(),
  });
  return config.aiDailyMessageLimit - row.count - cost;
}

/**
 * Turns an SDK error into something the user can act on. Without this an
 * expired key or an overloaded upstream both surface as a bare 500, which tells
 * whoever is running the deployment nothing.
 */
export function mapAnthropicError(err) {
  if (err instanceof HttpError) return err;

  const status = err?.status ?? err?.response?.status;
  if (status === 401 || status === 403) {
    return new HttpError(503, 'The sommelier’s API key was rejected. Check ANTHROPIC_API_KEY on the server.');
  }
  if (status === 429) {
    return new HttpError(429, 'Claude is rate-limiting this key. Give it a moment.');
  }
  if (status === 400) {
    return new HttpError(422, `Claude could not process that: ${err?.message || 'bad request'}`);
  }
  if (status >= 500 || err?.name === 'APIConnectionError' || err?.name === 'APIConnectionTimeoutError') {
    return new HttpError(503, 'Claude is having a moment. Try again shortly.');
  }
  return new HttpError(502, err?.message || 'The sommelier failed unexpectedly.');
}

/** Runs an SDK call with the error mapping applied. */
export async function callClaude(fn) {
  try {
    return await fn();
  } catch (err) {
    throw mapAnthropicError(err);
  }
}

export { anthropic, checkQuota };

const SOMMELIER_SYSTEM = `You are the sommelier inside Hopscotch, a craft beer passport app.

You are talking to someone who knows beer. Assume they can already tell a Hazy from a West Coast IPA and do not explain what an IBU is unless asked. Match that level: specific, opinionated, and willing to say a beer is overrated.

How to be useful here:
- Name actual breweries and actual beers. A recommendation without a name is not a recommendation.
- When they are travelling, think about what a city is genuinely known for rather than what is merely nearby. A work trip has maybe two free evenings; spend them well.
- Respect the cellar. If something is in its drink window, say so.
- On tasting notes, use the vocabulary of aroma, appearance, flavour, mouthfeel and finish. Never invent a score for a beer they have not rated.
- Be concise. Short paragraphs, no bullet-point walls, no preamble about what you are about to do.
- If you do not know whether a brewery still exists or still makes something, say so rather than guessing confidently. Taprooms close and recipes get retired.`;

/** A compact snapshot of the drinker, so answers are about them specifically. */
async function drinkerContext(user) {
  const store = getStore();
  const [pours, cellar, wishlist] = await Promise.all([
    store.query('pours', {
      where: [['userId', '==', user.id]],
      orderBy: 'drankAt',
      direction: 'desc',
      limit: 40,
    }),
    store.query('cellar', { where: [['userId', '==', user.id]], limit: 50 }),
    store.query('wishlist', { where: [['userId', '==', user.id]], limit: 50 }),
  ]);

  const familyCounts = {};
  for (const p of pours) familyCounts[p.family] = (familyCounts[p.family] || 0) + 1;

  const top = [...pours]
    .filter((p) => p.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((p) => `${p.beerName} — ${p.brewery || 'unknown brewery'} (${p.style}) ${p.score}/100`);

  const recent = pours
    .slice(0, 12)
    .map((p) => `${p.beerName} — ${p.brewery || '?'} (${p.style})${p.score != null ? ` ${p.score}/100` : ''}`);

  const lines = [
    `Drinker: ${user.displayName}.`,
    user.homeCity ? `Home base: ${user.homeCity}${user.homeState ? `, ${user.homeState}` : ''}.` : null,
    user.homeBreweryName ? `Their regular: ${user.homeBreweryName}.` : null,
    user.whiteWhaleBrewery ? `Brewery they chase: ${user.whiteWhaleBrewery}.` : null,
    `Beers logged: ${pours.length}.`,
    Object.keys(familyCounts).length
      ? `Style split: ${Object.entries(familyCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}.`
      : null,
    top.length ? `Their highest rated:\n${top.map((t) => `- ${t}`).join('\n')}` : null,
    recent.length ? `Most recent:\n${recent.map((t) => `- ${t}`).join('\n')}` : null,
    cellar.length
      ? `In the cellar:\n${cellar
          .slice(0, 20)
          .map((b) => `- ${b.beerName} (${b.brewery || '?'}${b.vintage ? `, ${b.vintage}` : ''}) x${b.quantity}${b.drinkFrom || b.drinkBy ? ` — window ${b.drinkFrom || '?'} to ${b.drinkBy || '?'}` : ''}`)
          .join('\n')}`
      : null,
    wishlist.length
      ? `On the wishlist: ${wishlist.slice(0, 20).map((w) => w.breweryName).join(', ')}.`
      : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export const aiRouter = Router();

aiRouter.get('/status', (_req, res) => {
  res.json({ enabled: config.aiEnabled, model: config.aiEnabled ? config.anthropicModel : null });
});

aiRouter.use(requireUser);

const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1)
    .max(40),
  context: z
    .object({
      city: z.string().max(120).optional(),
      breweries: z.array(z.string().max(160)).max(40).optional(),
    })
    .optional(),
});

/**
 * Streaming chat over SSE. Streaming matters here because a good itinerary
 * answer is long, and watching it arrive beats staring at a spinner.
 */
aiRouter.post(
  '/chat',
  wrap(async (req, res) => {
    const body = parse(chatInput, req.body);
    anthropic();
    const remaining = await checkQuota(req.user.id);

    const profile = await drinkerContext(req.user);
    const situational = [
      body.context?.city ? `They are currently looking at ${body.context.city}.` : null,
      body.context?.breweries?.length
        ? `Breweries on their screen right now: ${body.context.breweries.join(', ')}.`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('meta', { remaining, model: config.anthropicModel });

    try {
      const stream = anthropic().messages.stream({
        model: config.anthropicModel,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [
          // Stable prefix first so the cache actually holds across turns.
          { type: 'text', text: SOMMELIER_SYSTEM, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `About this drinker:\n${profile}${situational ? `\n\n${situational}` : ''}` },
        ],
        messages: body.messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          send('delta', { text: event.delta.text });
        }
      }

      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        send('error', { message: 'The model declined that one. Try asking it another way.' });
      }
      send('done', { usage: final.usage });
    } catch (err) {
      send('error', { message: mapAnthropicError(err).message });
    } finally {
      res.end();
    }
  })
);

/** One-shot helpers. Non-streaming: the answers are short by design. */
async function oneShot({ system, prompt, maxTokens = 2000 }) {
  const response = await callClaude(() =>
    anthropic().messages.create({
      model: config.anthropicModel,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: prompt }],
    })
  );
  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'The model declined that request.');
  }
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

const polishInput = z.object({
  beerName: z.string().max(160),
  brewery: z.string().max(160).default(''),
  style: z.string().max(120).default(''),
  rough: z.string().min(1).max(2000),
  scores: z.record(z.number()).optional(),
});

/** Turns "chocolatey, kinda hot, good" into notes worth re-reading in a year. */
aiRouter.post(
  '/polish-notes',
  wrap(async (req, res) => {
    const body = parse(polishInput, req.body);
    await checkQuota(req.user.id);

    const scoreLine = body.scores
      ? AXES.map((a) => (body.scores[a.key] != null ? `${a.label} ${body.scores[a.key]}/10` : null))
          .filter(Boolean)
          .join(', ')
      : '';

    const text = await oneShot({
      system:
        'You tidy rough beer tasting notes into clean ones. Keep every observation the drinker actually made and their opinion intact — you are editing, not reviewing. Use the order aroma, appearance, flavour, mouthfeel, finish, skipping anything they did not mention. Two short paragraphs at most. No preamble, no headings, no bullet points. Never add a flavour they did not describe and never invent a score.',
      prompt: `Beer: ${body.beerName}${body.brewery ? ` by ${body.brewery}` : ''}${body.style ? ` (${body.style})` : ''}
${scoreLine ? `Their scores: ${scoreLine}\n` : ''}Their rough notes: ${body.rough}`,
      maxTokens: 1200,
    });

    res.json({ notes: text });
  })
);

const tripInput = z.object({
  city: z.string().min(1).max(120),
  nights: z.number().int().min(1).max(14).default(2),
  breweries: z
    .array(
      z.object({
        name: z.string().max(160),
        type: z.string().max(40).default(''),
        city: z.string().max(80).default(''),
        walkMinutes: z.number().nullable().optional(),
      })
    )
    .max(20)
    .default([]),
  vibe: z.string().max(300).default(''),
});

/** Turns the planned route into an actual evening. */
aiRouter.post(
  '/trip-plan',
  wrap(async (req, res) => {
    const body = parse(tripInput, req.body);
    await checkQuota(req.user.id);
    const profile = await drinkerContext(req.user);

    const stopList = body.breweries.length
      ? body.breweries
          .map(
            (b, i) =>
              `${i + 1}. ${b.name}${b.type ? ` (${b.type})` : ''}${b.city ? `, ${b.city}` : ''}${
                b.walkMinutes != null ? ` — ${b.walkMinutes} min walk from the previous stop` : ''
              }`
          )
          .join('\n')
      : '(no shortlist — pick the stops yourself)';

    const text = await oneShot({
      system: `${SOMMELIER_SYSTEM}

Write a beer itinerary for a work trip. Real constraints: they land with work commitments, so give them an order and a rough time for each stop, and say what to actually order at each one. Flag anything that closes early or is worth a reservation. Keep it under 400 words. Prose with a stop-by-stop rundown, not a table.`,
      prompt: `City: ${body.city}
Free evenings: ${body.nights}
${body.vibe ? `What they want out of it: ${body.vibe}\n` : ''}Shortlist already on their map, in walking order:
${stopList}

About this drinker:
${profile}`,
      maxTokens: 3000,
    });

    res.json({ itinerary: text });
  })
);

const pairInput = z.object({
  question: z.string().min(1).max(600),
});

/** "What should I drink next?" — the question the whole app exists to answer. */
aiRouter.post(
  '/next-pour',
  wrap(async (req, res) => {
    const body = parse(pairInput, req.body);
    await checkQuota(req.user.id);
    const profile = await drinkerContext(req.user);

    const text = await oneShot({
      system: `${SOMMELIER_SYSTEM}

Recommend three specific beers, each with one sentence on why it follows from what they have been drinking. Name the brewery. If one of the three is a deliberate stretch outside their usual, say so. Under 200 words.`,
      prompt: `${body.question}\n\nAbout this drinker:\n${profile}`,
      maxTokens: 1500,
    });

    res.json({ answer: text });
  })
);

/* -------------------------------------------------------------------------
 * Photo scan
 * ---------------------------------------------------------------------- */

const scanInput = z.object({
  // A data URL from the browser's canvas, or bare base64 plus a media type.
  image: z.string().min(64).max(9_000_000),
  mediaType: z.enum(ALLOWED_IMAGE_TYPES).optional(),
  hint: z.string().max(300).optional(),
});

/**
 * Reads a photo of a can, a bottle or a poured beer. Fills in what can be seen
 * and deliberately refuses to fill in what cannot — see domain/vision.js.
 */
aiRouter.post(
  '/scan',
  wrap(async (req, res) => {
    const body = parse(scanInput, req.body);
    anthropic();
    const remaining = await checkQuota(req.user.id, 1);
    let mediaType;
    let data;
    try {
      ({ mediaType, data } = decodeImagePayload(body.image, body.mediaType));
    } catch (err) {
      throw new HttpError(err.status || 400, err.message);
    }

    const response = await callClaude(() =>
      anthropic().messages.parse({
        model: config.anthropicModel,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: jsonSchemaOutputFormat(SCAN_SCHEMA) },
        system: SCAN_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              {
                type: 'text',
                text: body.hint
                  ? `Read this beer. Context from the drinker: ${body.hint}`
                  : 'Read this beer.',
              },
            ],
          },
        ],
      })
    );

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'The model declined to read that image.');
    }
    if (!response.parsed_output) {
      throw new HttpError(502, 'The scan came back unreadable. Try another photo.');
    }

    res.json({ scan: response.parsed_output, remaining });
  })
);

/* -------------------------------------------------------------------------
 * Look a beer up on the open web
 * ---------------------------------------------------------------------- */

const lookupInput = z.object({
  beerName: z.string().trim().min(1).max(160),
  brewery: z.string().trim().max(160).default(''),
});

/**
 * What the web says about a specific beer. Separate from /scan because it costs
 * a search and most scans do not need one — and because everything it reports
 * has to carry a source the drinker can check.
 */
aiRouter.post(
  '/lookup',
  wrap(async (req, res) => {
    const body = parse(lookupInput, req.body);
    anthropic();
    await checkQuota(req.user.id, 2);

    const { text, sources, searched } = await callClaude(() =>
      searchWeb(anthropic(), {
        model: config.anthropicModel,
        system: `${SOMMELIER_SYSTEM}

Report what the open web says about one specific beer: its style, ABV, whether it is seasonal or year-round, how it is generally regarded, and anything notable about how it is released or distributed. Attribute claims to what you found. If the beer looks retired, discontinued or renamed, lead with that. If you cannot confirm the beer exists, say so plainly instead of describing a plausible beer. Under 180 words, no headings.`,
        prompt: `Beer: ${body.beerName}${body.brewery ? ` by ${body.brewery}` : ''}`,
        maxUses: 4,
        maxTokens: 4000,
      })
    );

    res.json({ answer: text, sources, searched });
  })
);
