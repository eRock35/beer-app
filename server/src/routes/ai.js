import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { HttpError, parse, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { AXES } from '../domain/scoring.js';

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
async function checkQuota(userId) {
  const store = getStore();
  const day = new Date().toISOString().slice(0, 10);
  const id = `${userId}_${day}`;
  const row = (await store.get('ai_usage', id)) || { userId, day, count: 0 };
  if (row.count >= config.aiDailyMessageLimit) {
    throw new HttpError(
      429,
      `You have used today's ${config.aiDailyMessageLimit} sommelier messages. It resets at midnight UTC.`
    );
  }
  await store.put('ai_usage', id, { ...row, count: row.count + 1, updatedAt: new Date().toISOString() });
  return config.aiDailyMessageLimit - row.count - 1;
}

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
      send('error', { message: err?.message || 'The sommelier lost its train of thought.' });
    } finally {
      res.end();
    }
  })
);

/** One-shot helpers. Non-streaming: the answers are short by design. */
async function oneShot({ system, prompt, maxTokens = 2000 }) {
  const response = await anthropic().messages.create({
    model: config.anthropicModel,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
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
