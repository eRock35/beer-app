/** Thin fetch wrapper. Cookies carry the session, so nothing here touches tokens. */
async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    signal,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const api = {
  reference: () => request('/reference'),
  health: () => request('/health'),

  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PATCH', body }),

  searchBreweries: (params, signal) => request(`/breweries/search${qs(params)}`, { signal }),
  geocode: (q) => request(`/breweries/geocode${qs({ q })}`),
  planRoute: (body) => request('/breweries/route', { method: 'POST', body }),

  pours: (params = {}) => request(`/pours${qs(params)}`),
  feed: () => request('/pours/feed'),
  createPour: (body) => request('/pours', { method: 'POST', body }),
  updatePour: (id, body) => request(`/pours/${id}`, { method: 'PATCH', body }),
  deletePour: (id) => request(`/pours/${id}`, { method: 'DELETE' }),
  cheer: (id) => request(`/pours/${id}/cheers`, { method: 'POST' }),
  comment: (id, body) => request(`/pours/${id}/comments`, { method: 'POST', body: { body } }),
  pour: (id) => request(`/pours/${id}`),

  passport: () => request('/passport'),

  list: (kind) => request(`/${kind}`),
  add: (kind, body) => request(`/${kind}`, { method: 'POST', body }),
  update: (kind, id, body) => request(`/${kind}/${id}`, { method: 'PATCH', body }),
  remove: (kind, id) => request(`/${kind}/${id}`, { method: 'DELETE' }),

  aiStatus: () => request('/ai/status'),
  polishNotes: (body) => request('/ai/polish-notes', { method: 'POST', body }),
  tripPlan: (body) => request('/ai/trip-plan', { method: 'POST', body }),
  nextPour: (question) => request('/ai/next-pour', { method: 'POST', body: { question } }),
};

/**
 * Streams the sommelier reply over SSE. Calls onDelta for each text chunk and
 * resolves when the stream closes; returns an abort function for unmounts.
 */
export function streamChat({ messages, context }, { onDelta, onDone, onError, signal }) {
  const controller = new AbortController();
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  (async () => {
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, context }),
        credentials: 'same-origin',
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        let message = `The sommelier is unavailable (${res.status}).`;
        try {
          message = JSON.parse(text).error || message;
        } catch {
          /* non-JSON error body; keep the status message */
        }
        onError?.(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const eventLine = frame.split('\n').find((l) => l.startsWith('event: '));
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          let payload;
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          const type = eventLine?.slice(7).trim();
          if (type === 'delta') onDelta?.(payload.text);
          else if (type === 'error') onError?.(payload.message);
          else if (type === 'done') onDone?.(payload);
        }
      }
      onDone?.({});
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message);
    }
  })();

  return () => controller.abort();
}
