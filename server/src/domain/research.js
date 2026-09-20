/**
 * Web-search-backed research.
 *
 * There is no public feed of beer distribution — no API tells you that a pallet
 * of something good is landing in Denver next Thursday. What does exist is what
 * breweries, bottle shops and beer press publish on the open web. So this runs
 * a real web search through Claude's server-side search tool and reports what it
 * found, with the source links attached, rather than pretending to a data feed
 * that does not exist.
 */

/** A turn can stop for more searching; resume it rather than truncating. */
const MAX_RESUMES = 4;

/**
 * Runs a search-backed prompt and returns the prose plus every source consulted.
 * @returns {Promise<{text: string, sources: Array<{url: string, title: string}>, searched: boolean}>}
 */
export async function searchWeb(client, { model, system, prompt, maxUses = 6, maxTokens = 8000 }) {
  const messages = [{ role: 'user', content: prompt }];
  const sources = [];
  let text = '';
  let searched = false;

  for (let attempt = 0; attempt <= MAX_RESUMES; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses }],
      system,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined that search.');
    }

    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'web_search_tool_result') {
        searched = true;
        // On success `content` is a list of results; on failure it is a single
        // error object. Branch before indexing.
        const results = Array.isArray(block.content) ? block.content : [];
        for (const r of results) {
          if (r?.url && !sources.some((s) => s.url === r.url)) {
            sources.push({ url: r.url, title: r.title || r.url });
          }
        }
      }
    }

    if (response.stop_reason !== 'pause_turn') break;
    // Hand the paused turn back so the search can carry on.
    messages.push({ role: 'assistant', content: response.content });
  }

  return { text: text.trim(), sources, searched };
}

export const DISPATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['finds', 'summary'],
  properties: {
    summary: { type: 'string', description: 'One or two sentences on what turned up, or that nothing did.' },
    finds: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'brewery', 'beer', 'place', 'when', 'kind', 'why', 'confidence', 'sourceUrl'],
        properties: {
          headline: { type: 'string', description: 'One line, specific. No marketing language.' },
          brewery: { type: ['string', 'null'] },
          beer: { type: ['string', 'null'] },
          place: { type: ['string', 'null'], description: 'Where you would go to get it.' },
          when: { type: ['string', 'null'], description: 'A date or window as published, e.g. "Fri 3 Oct" or "mid-October".' },
          kind: {
            type: 'string',
            enum: ['release', 'distribution', 'taproom-only', 'festival', 'closing', 'other'],
          },
          why: { type: 'string', description: 'One sentence on why this drinker specifically would care.' },
          confidence: {
            type: 'string',
            enum: ['confirmed', 'likely', 'rumour'],
            description: 'confirmed only when a source states it outright with a date.',
          },
          sourceUrl: { type: ['string', 'null'], description: 'Must be one of the URLs actually consulted.' },
        },
      },
    },
  },
};
