import { Router } from 'express';
import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { badRequest, HttpError, wrap } from '../lib/http.js';
import { describeRoute, haversineKm, kmToMiles, planRoute } from '../domain/geo.js';

const breweryCache = new TtlCache({ max: 500, ttlMs: 60 * 60 * 1000 });
const geoCache = new TtlCache({ max: 500, ttlMs: 24 * 60 * 60 * 1000 });

/**
 * Both upstreams are free community services that can rate-limit, go down, or
 * be blocked by a network policy. When that happens we answer with a 503 and a
 * sentence a person can act on, rather than a bare 500 — the map then tells the
 * user the directory is unreachable instead of looking broken.
 */
async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const host = new URL(url).host;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': config.userAgent },
      signal: controller.signal,
    });
    if (res.status === 404) throw new HttpError(404, 'No brewery with that id.');
    if (res.status === 429) {
      throw new HttpError(503, `${host} is rate-limiting us. Give it a minute.`);
    }
    if (!res.ok) {
      throw new HttpError(503, `The brewery directory (${host}) answered ${res.status}.`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err?.name === 'AbortError') {
      throw new HttpError(503, `${host} did not answer in time.`);
    }
    throw new HttpError(503, `Could not reach ${host}. It may be down or blocked by the network.`);
  } finally {
    clearTimeout(timer);
  }
}

/** Open Brewery DB gives us strings; the map needs numbers and a stable shape. */
function normalise(raw) {
  const lat = Number(raw.latitude);
  const lng = Number(raw.longitude);
  return {
    id: raw.id,
    name: raw.name,
    type: raw.brewery_type,
    street: raw.street || raw.address_1 || '',
    city: raw.city || '',
    state: raw.state_province || raw.state || '',
    postalCode: raw.postal_code || '',
    country: raw.country || '',
    phone: raw.phone || '',
    website: raw.website_url || '',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

const withCoords = (list) => list.filter((b) => b.lat != null && b.lng != null);

async function searchBreweries(params) {
  const url = new URL(`${config.breweryApiBase}/breweries`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  const key = url.toString();
  const raw = await breweryCache.wrap(key, () => fetchJson(key));
  return (Array.isArray(raw) ? raw : []).map(normalise);
}

async function geocode(place) {
  const key = place.trim().toLowerCase();
  if (!key) return null;
  return geoCache.wrap(key, async () => {
    const url = new URL(`${config.nominatimBase}/search`);
    url.searchParams.set('q', place);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    const results = await fetchJson(url.toString());
    const hit = Array.isArray(results) ? results[0] : null;
    if (!hit) return null;
    return {
      label: hit.display_name,
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      city: hit.address?.city || hit.address?.town || hit.address?.village || '',
      state: hit.address?.state || '',
      country: hit.address?.country_code?.toUpperCase() || '',
    };
  });
}

export const breweryRouter = Router();

/** Autocomplete for the search box. */
breweryRouter.get(
  '/autocomplete',
  wrap(async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    const url = `${config.breweryApiBase}/breweries/autocomplete?query=${encodeURIComponent(query)}`;
    const raw = await breweryCache.wrap(url, () => fetchJson(url));
    res.json({ results: (raw || []).slice(0, 15) });
  })
);

/**
 * The one endpoint the map uses. Accepts a free-text place, an explicit
 * lat/lng, or a brewery name, and always answers with a centre plus a list.
 */
breweryRouter.get(
  '/search',
  wrap(async (req, res) => {
    const { q = '', near = '', type = '', perPage = '50' } = req.query;
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Math.min(Number(perPage) || 50, 200);

    let centre = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    let place = null;

    if (!centre && near) {
      place = await geocode(String(near));
      if (place) centre = { lat: place.lat, lng: place.lng };
    }

    let breweries = [];
    if (centre) {
      breweries = await searchBreweries({
        by_dist: `${centre.lat},${centre.lng}`,
        per_page: String(limit),
        by_type: type || undefined,
      });
    } else if (q) {
      breweries = await searchBreweries({ by_name: String(q), per_page: String(limit) });
    } else {
      return res.json({ centre: null, place: null, breweries: [] });
    }

    // A text query alongside a place acts as a filter on the nearby set.
    if (centre && q) {
      const needle = String(q).toLowerCase();
      const filtered = breweries.filter((b) => b.name.toLowerCase().includes(needle));
      if (filtered.length) breweries = filtered;
    }

    const decorated = withCoords(breweries)
      .map((b) => {
        const km = centre ? haversineKm(centre, b) : null;
        return { ...b, distanceKm: km, distanceMiles: km == null ? null : kmToMiles(km) };
      })
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    if (!centre && decorated.length) {
      centre = { lat: decorated[0].lat, lng: decorated[0].lng };
    }

    res.json({ centre, place, breweries: decorated });
  })
);

breweryRouter.get(
  '/geocode',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) throw badRequest('Give me a place to look up.');
    res.json({ place: await geocode(q) });
  })
);

breweryRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const url = `${config.breweryApiBase}/breweries/${encodeURIComponent(req.params.id)}`;
    const raw = await breweryCache.wrap(url, () => fetchJson(url));
    res.json({ brewery: normalise(raw) });
  })
);

/**
 * Crawl planner: given a set of breweries, order them into a walkable route.
 * Kept on the server so the same ordering feeds the AI itinerary prompt.
 */
breweryRouter.post(
  '/route',
  wrap(async (req, res) => {
    const stops = Array.isArray(req.body?.stops) ? req.body.stops : [];
    if (stops.length < 2) throw badRequest('A crawl needs at least two stops.');
    if (stops.length > 12) throw badRequest('Twelve stops is already a bad idea. Trim the list.');
    const start = req.body?.start;
    const ordered = planRoute(stops, start);
    res.json({ route: ordered, ...describeRoute(ordered, start) });
  })
);

export { geocode, searchBreweries };
