import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../lib/api.js';
import { useApp } from '../store.jsx';
import { Banner, Field, Sheet, Spinner } from '../components/ui.jsx';
import { distanceLabel, placeLine } from '../lib/format.js';
import { PourForm } from './PourForm.jsx';

/**
 * Pin colour encodes visit state — three values only, which is what keeps the
 * palette inside the all-pairs colour-blindness gate. Every state also has an
 * icon and a legend label, so colour is never the only signal.
 */
const PIN_STATES = {
  visited: { colour: 'var(--series-3)', icon: '✓', label: 'Been there' },
  wishlist: { colour: 'var(--series-1)', icon: '★', label: 'On your list' },
  new: { colour: 'var(--series-2)', icon: '', label: 'Not yet' },
};

const TYPE_LABELS = {
  micro: 'Microbrewery',
  nano: 'Nano',
  regional: 'Regional',
  brewpub: 'Brewpub',
  large: 'Large',
  planning: 'In planning',
  bar: 'Bar',
  contract: 'Contract',
  proprietor: 'Proprietor',
  closed: 'Closed',
  taproom: 'Taproom',
};

function pinIcon(state) {
  const { colour, icon } = PIN_STATES[state];
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${colour};color:${colour}"><span>${icon}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

export function MapView() {
  const { user } = useApp();
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markerLayer = useRef(null);

  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(user?.homeCity ? placeLine(user.homeCity, user.homeState) : '');
  const [breweries, setBreweries] = useState([]);
  const [centre, setCentre] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState(null);
  const [visited, setVisited] = useState(new Set());
  const [wishlist, setWishlist] = useState(new Map());
  const [typeFilter, setTypeFilter] = useState('');

  /* ---- which pins are already in the user's world ---- */
  const loadOverlays = useCallback(async () => {
    if (!user) return;
    try {
      const [{ pours }, { items }] = await Promise.all([api.pours({ limit: 500 }), api.list('wishlist')]);
      setVisited(new Set(pours.map((p) => p.breweryId || p.brewery?.toLowerCase()).filter(Boolean)));
      setWishlist(new Map(items.map((w) => [w.breweryId || w.breweryName.toLowerCase(), w])));
    } catch {
      // Overlays are a nicety; the map still works without them.
    }
  }, [user]);

  useEffect(() => {
    loadOverlays();
  }, [loadOverlays]);

  const stateOf = useCallback(
    (brewery) => {
      const key = brewery.id;
      const nameKey = brewery.name.toLowerCase();
      if (visited.has(key) || visited.has(nameKey)) return 'visited';
      if (wishlist.has(key) || wishlist.has(nameKey)) return 'wishlist';
      return 'new';
    },
    [visited, wishlist]
  );

  /* ---- the map itself ---- */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      [39.5, -96],
      4
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Leaflet mis-measures inside a grid that is still settling.
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const search = useCallback(
    async ({ near, lat, lng, q } = {}) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.searchBreweries({
          near: near ?? (lat == null ? place : ''),
          lat,
          lng,
          q: q ?? query,
          type: typeFilter,
          perPage: 60,
        });
        setBreweries(data.breweries);
        setCentre(data.centre);
        if (data.centre && mapRef.current) {
          mapRef.current.setView([data.centre.lat, data.centre.lng], data.breweries.length ? 12 : 9);
        }
        if (!data.breweries.length) setError('Nothing found there. Try a bigger city or a different spelling.');
      } catch (err) {
        setError(err.message);
        setBreweries([]);
      } finally {
        setLoading(false);
      }
    },
    [place, query, typeFilter]
  );

  // First load: home city if we know one, otherwise wait for the user.
  useEffect(() => {
    if (user?.homeCity) search({ near: placeLine(user.homeCity, user.homeState) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.homeCity]);

  const nearMe = () => {
    if (!navigator.geolocation) {
      setError('This browser will not share a location.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlace('');
        search({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLoading(false);
        setError('Location denied. Type a city instead.');
      },
      { timeout: 8000 }
    );
  };

  /* ---- render markers whenever the list or overlays change ---- */
  useEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    layer.clearLayers();

    for (const brewery of breweries) {
      const state = stateOf(brewery);
      const marker = L.marker([brewery.lat, brewery.lng], {
        icon: pinIcon(state),
        title: brewery.name,
        alt: `${brewery.name} — ${PIN_STATES[state].label}`,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(brewery.name)}</strong><br>` +
          `<span style="color:var(--text-secondary)">${escapeHtml(
            [TYPE_LABELS[brewery.type] || brewery.type, placeLine(brewery.city, brewery.state)]
              .filter(Boolean)
              .join(' · ')
          )}</span>`
      );
      marker.on('click', () => setSelected(brewery));
      layer.addLayer(marker);
    }
  }, [breweries, stateOf]);

  const focus = (brewery) => {
    setSelected(brewery);
    mapRef.current?.setView([brewery.lat, brewery.lng], 15, { animate: true });
  };

  const toggleWishlist = async (brewery) => {
    const key = brewery.id;
    const existing = wishlist.get(key) || wishlist.get(brewery.name.toLowerCase());
    try {
      if (existing) {
        await api.remove('wishlist', existing.id);
      } else {
        await api.add('wishlist', {
          breweryId: brewery.id,
          breweryName: brewery.name,
          city: brewery.city,
          state: brewery.state,
          lat: brewery.lat,
          lng: brewery.lng,
          priority: 'someday',
          note: '',
        });
      }
      await loadOverlays();
    } catch (err) {
      setError(err.message);
    }
  };

  const counts = useMemo(() => {
    const tally = { visited: 0, wishlist: 0, new: 0 };
    for (const b of breweries) tally[stateOf(b)] += 1;
    return tally;
  }, [breweries, stateOf]);

  return (
    <div className="map-shell">
      <aside className="map-panel">
        <div className="map-search">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <Field label="Where are you?" id="map-place">
              <input
                id="map-place"
                className="input"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Portland, ME — or a hotel address"
                autoComplete="off"
              />
            </Field>

            <Field label="Filter by name" id="map-query">
              <input
                id="map-query"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Optional — e.g. Side Project"
                autoComplete="off"
              />
            </Field>

            <Field label="Kind" id="map-type">
              <select id="map-type" className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Everything</option>
                <option value="micro">Microbrewery</option>
                <option value="brewpub">Brewpub</option>
                <option value="regional">Regional</option>
                <option value="nano">Nano</option>
                <option value="taproom">Taproom</option>
              </select>
            </Field>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? <Spinner /> : 'Search'}
              </button>
              <button type="button" className="btn" onClick={nearMe} disabled={loading} title="Use my location">
                📍
              </button>
            </div>
          </form>

          {error && <div style={{ marginTop: 12 }}><Banner kind="error">{error}</Banner></div>}

          {breweries.length > 0 && (
            <div className="legend" aria-label="Pin meanings">
              {Object.entries(PIN_STATES).map(([key, meta]) => (
                <span className="legend-item" key={key}>
                  <span className="legend-swatch" style={{ background: meta.colour }} aria-hidden="true" />
                  {meta.label} ({counts[key]})
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          {breweries.map((brewery) => {
            const state = stateOf(brewery);
            return (
              <button
                type="button"
                key={brewery.id}
                className="brewery-row"
                aria-selected={selected?.id === brewery.id}
                onClick={() => focus(brewery)}
              >
                <span
                  className="brewery-dot"
                  style={{ background: PIN_STATES[state].colour, color: PIN_STATES[state].colour }}
                  aria-hidden="true"
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="brewery-row-name">{brewery.name}</span>
                  <span className="brewery-row-meta" style={{ display: 'block' }}>
                    {[TYPE_LABELS[brewery.type] || brewery.type, placeLine(brewery.city, brewery.state)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="brewery-row-meta muted">
                    {PIN_STATES[state].label}
                    {brewery.distanceMiles != null && ` · ${distanceLabel(brewery.distanceMiles)}`}
                  </span>
                </span>
              </button>
            );
          })}

          {!loading && !breweries.length && (
            <p className="secondary" style={{ padding: 20, fontSize: '0.9rem' }}>
              Search a city to drop pins. Everything runs off the Open Brewery DB directory, so
              small taprooms in unfamiliar towns show up too.
            </p>
          )}
        </div>
      </aside>

      <div className="map-canvas">
        <div id="map" ref={containerRef} />
      </div>

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name || ''}
        subtitle={
          selected
            ? [TYPE_LABELS[selected.type] || selected.type, placeLine(selected.street, selected.city, selected.state)]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
      >
        {selected && (
          <div className="stack">
            {selected.distanceMiles != null && centre && (
              <p className="secondary" style={{ margin: 0, fontSize: '0.88rem' }}>
                {distanceLabel(selected.distanceMiles)} from your search centre.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {user && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => setLogging(selected)}>
                    🍺 Log a pour here
                  </button>
                  <button type="button" className="btn" onClick={() => toggleWishlist(selected)}>
                    {stateOf(selected) === 'wishlist' ? '★ On your list' : '☆ Add to list'}
                  </button>
                </>
              )}
              {selected.website && (
                <a className="btn" href={selected.website} target="_blank" rel="noreferrer noopener">
                  Website ↗
                </a>
              )}
              <a
                className="btn"
                href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=17/${selected.lat}/${selected.lng}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Directions ↗
              </a>
            </div>

            {!user && (
              <Banner>Sign in to log pours here and keep a wishlist.</Banner>
            )}

            {selected.phone && (
              <p className="secondary" style={{ margin: 0, fontSize: '0.88rem' }}>📞 {selected.phone}</p>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(logging)}
        onClose={() => setLogging(null)}
        title="Log a pour"
        subtitle={logging?.name}
      >
        {logging && (
          <PourForm
            preset={{
              brewery: logging.name,
              breweryId: logging.id,
              city: logging.city,
              state: logging.state,
              country: logging.country,
              lat: logging.lat,
              lng: logging.lng,
            }}
            onSaved={async () => {
              setLogging(null);
              setSelected(null);
              await loadOverlays();
            }}
            onCancel={() => setLogging(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
