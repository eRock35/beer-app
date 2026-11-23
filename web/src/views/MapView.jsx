import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../lib/api.js';
import { useApp } from '../store.jsx';
import { Banner, Field, FormGroup, IconButton, Sheet, Spinner, usePhone } from '../components/ui.jsx';
import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  CompassIcon,
  GlassIcon,
  LocationIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SignpostIcon,
  SlidersIcon,
  StarIcon,
} from '../components/icons.jsx';
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

const SHEET_SIZES = ['peek', 'half', 'full'];

/**
 * A first visit should show what the app does, not an empty map of a
 * continent. Until someone searches, the map opens on one good beer town,
 * says plainly that it is an example, and remembers the last real search
 * after that (in this browser only - nothing is sent anywhere).
 */
const EXAMPLE = { place: 'Asheville, NC', lat: 35.5954, lng: -82.5508 };
const LAST_KEY = 'hopscotch:last-search';

function readLast() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return last && Number.isFinite(last.lat) && Number.isFinite(last.lng) ? last : null;
  } catch {
    return null;
  }
}
function writeLast(last) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(last));
  } catch {
    // Private windows may refuse storage; the map still works.
  }
}

function pinIcon(state) {
  const { icon } = PIN_STATES[state];
  return L.divIcon({
    className: '',
    html: `<div class="pin pin-${state}"><span>${icon}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

export function MapView({ go }) {
  const { user } = useApp();
  const phone = usePhone();
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markerLayer = useRef(null);

  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(() =>
    user?.homeCity ? placeLine(user.homeCity, user.homeState) : readLast()?.place || ''
  );
  // True while the pins on show are the example town rather than a search.
  const [isExample, setIsExample] = useState(false);
  const [breweries, setBreweries] = useState([]);
  const [centre, setCentre] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState(null);
  const [visited, setVisited] = useState(new Set());
  const [wishlist, setWishlist] = useState(new Map());
  const [typeFilter, setTypeFilter] = useState('');
  const [sheetSize, setSheetSize] = useState('half');
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    const isPhone = window.matchMedia('(max-width: 767px)').matches;
    const opening = readLast() || EXAMPLE;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView(
      [opening.lat, opening.lng],
      12
    );
    // On a phone the floating search sits top-left and the list sheet covers
    // the bottom, so the zoom control goes top-right where neither reaches.
    L.control.zoom({ position: isPhone ? 'topright' : 'topleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Leaflet mis-measures inside a layout that is still settling.
    const settle = setTimeout(() => map.invalidateSize(), 120);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // The visible map area changes with the sheet and the breakpoint.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [sheetSize, phone]);

  /**
   * Centre the map on a point. On a phone the search bar covers the top of
   * the map and the list sheet the bottom, so "centre" means the middle of
   * what is left - otherwise the pins open half-hidden behind the list.
   */
  const centreOn = useCallback((lat, lng, zoom, options) => {
    const map = mapRef.current;
    if (!map) return;
    if (!window.matchMedia('(max-width: 767px)').matches) {
      map.setView([lat, lng], zoom, options);
      return;
    }
    const height = map.getSize().y;
    const sheet = containerRef.current?.closest('.map-shell')?.querySelector('.map-sheet');
    const covered = Math.min(sheet ? sheet.getBoundingClientRect().height : 0, height * 0.6);
    const shifted = map.project([lat, lng], zoom).add([0, (covered - 68) / 2]);
    map.setView(map.unproject(shifted, zoom), zoom, options);
  }, []);

  const search = useCallback(
    async ({ near, lat, lng, q, example = false } = {}) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.searchBreweries({
          near: near ?? (lat == null ? place : ''),
          lat,
          lng,
          q: example ? '' : q ?? query,
          type: example ? '' : typeFilter,
          perPage: 60,
        });
        setBreweries(data.breweries);
        setCentre(data.centre);
        setIsExample(example);
        if (data.centre) {
          centreOn(data.centre.lat, data.centre.lng, data.breweries.length ? 12 : 9);
          if (!example && data.breweries.length) {
            writeLast({ place: lat == null ? near ?? place : '', lat: data.centre.lat, lng: data.centre.lng });
          }
        }
        if (!data.breweries.length && !example) setError('Nothing found there. Try a bigger city or a different spelling.');
      } catch (err) {
        // The example is a courtesy: if it cannot load, the plain prompt shows instead.
        if (!example) setError(err.message);
        setBreweries([]);
      } finally {
        setLoading(false);
      }
    },
    [place, query, typeFilter, centreOn]
  );

  // First load: home city if we know one, then wherever this browser last
  // searched, then the example town - never an empty map.
  useEffect(() => {
    const last = readLast();
    if (user?.homeCity) search({ near: placeLine(user.homeCity, user.homeState) });
    else if (last?.place) search({ near: last.place });
    else if (last) search({ lat: last.lat, lng: last.lng });
    else search({ near: EXAMPLE.place, example: true });
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
          `<span class="popup-meta">${escapeHtml(
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
    centreOn(brewery.lat, brewery.lng, 15, { animate: true });
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

  const cycleSheet = () => {
    setSheetSize((s) => SHEET_SIZES[(SHEET_SIZES.indexOf(s) + 1) % SHEET_SIZES.length]);
  };

  const submitSearch = (e) => {
    e.preventDefault();
    e.currentTarget.querySelector('input')?.blur();
    search();
    if (phone) setSheetSize('half');
  };

  const legend = breweries.length > 0 && (
    <div className="legend" aria-label="Pin meanings">
      {Object.entries(PIN_STATES).map(([key, meta]) => (
        <span className="legend-item" key={key}>
          <span className="legend-swatch" style={{ background: meta.colour }} aria-hidden="true" />
          {meta.label} <span className="tabular">({counts[key]})</span>
        </span>
      ))}
    </div>
  );

  // Home is where the main jobs start. A visitor is told what this is and
  // given the one thing they can try without an account; someone signed in
  // gets the two things they open the app to do, one tap away.
  const intro = user ? (
    <div className="map-quick">
      <div className="map-actions">
        <button type="button" className="btn btn-primary" onClick={() => go('journal/new')}>
          <PlusIcon /> Log a pour
        </button>
        <button type="button" className="btn" onClick={() => go('trips/new')}>
          <SignpostIcon /> Plan a crawl
        </button>
      </div>
    </div>
  ) : (
    <div className="map-intro">
      <h2>Find good beer wherever you land.</h2>
      <p>Every brewery on a map, a tasting journal that scores like a judge, and a crawl planner for your free evenings.</p>
      <div className="map-actions">
        <button type="button" className="btn btn-primary" onClick={() => go('trips/new')}>
          <SignpostIcon /> Plan a crawl
        </button>
        <button type="button" className="btn" onClick={() => go('journal')}>
          Sign in
        </button>
      </div>
    </div>
  );

  const exampleNote = isExample && breweries.length > 0 && (
    <p className="map-example">
      An example to look around: {EXAMPLE.place}. Search any city, or use your location, to see your own.
    </p>
  );

  const list = (
    <>
      {exampleNote}
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
            <span className="brewery-row-text">
              <span className="brewery-row-name">{brewery.name}</span>
              <span className="brewery-row-meta">
                {[TYPE_LABELS[brewery.type] || brewery.type, placeLine(brewery.city, brewery.state)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="brewery-row-meta">
                {PIN_STATES[state].label}
                {brewery.distanceMiles != null && ` · ${distanceLabel(brewery.distanceMiles)}`}
              </span>
            </span>
            <span className="brewery-row-chev" aria-hidden="true">
              <ChevronRightIcon size={18} />
            </span>
          </button>
        );
      })}

      {!loading && !breweries.length && !error && (
        <div className="empty">
          <span className="empty-icon" aria-hidden="true">
            <CompassIcon />
          </span>
          <h3>Search a city to drop pins</h3>
          <p className="secondary empty-copy">
            Everything runs off the Open Brewery DB directory, so small taprooms in unfamiliar
            towns show up too.
          </p>
        </div>
      )}
      {loading && !breweries.length && (
        <div style={{ padding: '16px 0' }} className="stack" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48 }} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="map-shell">
      {phone ? null : (
        <aside className="map-panel">
          <div className="map-search">
            <form onSubmit={submitSearch}>
              <Field label="Where are you?" id="map-place">
                <input
                  id="map-place"
                  className="input"
                  type="search"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Portland, ME — or a hotel address"
                  autoComplete="off"
                  enterKeyHint="search"
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
                  enterKeyHint="search"
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

              <div className="map-search-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <Spinner /> : 'Search'}
                </button>
                <IconButton label="Use my location" onClick={nearMe} disabled={loading}>
                  <LocationIcon size={20} strokeWidth={1.5} />
                </IconButton>
              </div>
            </form>

            {error && <div style={{ marginTop: 12 }}><Banner kind="error">{error}</Banner></div>}
            {legend}
          </div>

          <div className="map-list">
            {intro}
            {list}
          </div>
        </aside>
      )}

      <div className="map-canvas">
        <div id="map" ref={containerRef} />
      </div>

      {phone ? (
        <>
          <div className="map-float">
            <form onSubmit={submitSearch} role="search">
              <div className="search-wrap">
                <SearchIcon className="search-icon" size={18} strokeWidth={1.5} />
                <input
                  id="map-place"
                  className="input"
                  type="search"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="City or address"
                  aria-label="Where are you?"
                  autoComplete="off"
                  autoCapitalize="words"
                  enterKeyHint="search"
                  inputMode="search"
                />
              </div>
              <IconButton label="Use my location" onClick={nearMe} disabled={loading}>
                <LocationIcon size={22} strokeWidth={1.5} />
              </IconButton>
              <IconButton label="Filters" onClick={() => setFiltersOpen(true)}>
                <SlidersIcon size={22} strokeWidth={1.5} />
              </IconButton>
            </form>
          </div>

          <section className={`map-sheet is-${sheetSize}`} aria-label="Brewery list">
            <div className="map-sheet-head">
              <button type="button" className="map-sheet-grab" onClick={cycleSheet} aria-label="Resize the list">
                <span className="grabber" aria-hidden="true" />
              </button>
              <div className="map-sheet-title">
                <h2 className="tabular">
                  {breweries.length
                    ? `${breweries.length} ${breweries.length === 1 ? 'brewery' : 'breweries'}${isExample ? ` in ${EXAMPLE.place}` : ''}`
                    : 'Breweries'}
                </h2>
                {/* The map's credit. Leaflet's own control is hidden on a phone
                    (it sits under this sheet), so this line is the attribution. */}
                <span className="map-credit">
                  {loading && <Spinner label="Searching" />}
                  <span>
                    © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
                  </span>
                </span>
              </div>
              {legend}
            </div>
            <div className="map-sheet-body">
              {intro}
              {error && <div style={{ padding: '12px 0 0' }}><Banner kind="error">{error}</Banner></div>}
              {list}
            </div>
          </section>
        </>
      ) : null}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" width={420}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFiltersOpen(false);
            search();
          }}
        >
          <FormGroup>
            <Field label="Filter by name" id="map-query">
              <input
                id="map-query"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Optional — e.g. Side Project"
                autoComplete="off"
                enterKeyHint="search"
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
          </FormGroup>
          <button type="submit" className="btn btn-primary btn-block btn-lg">
            Search
          </button>
        </form>
      </Sheet>

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
              <p className="secondary" style={{ margin: 0, fontSize: 15 }}>
                {distanceLabel(selected.distanceMiles)} from your search centre.
              </p>
            )}

            {user ? (
              <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => setLogging(selected)}>
                <GlassIcon /> Log a pour here
              </button>
            ) : (
              <Banner>Sign in to log pours here and keep a wishlist.</Banner>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {user && (
                <button type="button" className="btn btn-secondary" onClick={() => toggleWishlist(selected)}>
                  <StarIcon filled={stateOf(selected) === 'wishlist'} />
                  {stateOf(selected) === 'wishlist' ? 'On your list' : 'Add to list'}
                </button>
              )}
              <a
                className="btn btn-secondary"
                href={`https://maps.apple.com/?ll=${selected.lat},${selected.lng}&q=${encodeURIComponent(selected.name)}`}
                target="_blank"
                rel="noopener"
              >
                <MapPinIcon /> Directions
              </a>
              {selected.website && (
                <a className="btn btn-secondary" href={selected.website} target="_blank" rel="noopener">
                  <ArrowUpRightIcon /> Website
                </a>
              )}
              {selected.phone && (
                <a className="btn btn-secondary" href={`tel:${String(selected.phone).replace(/[^\d+]/g, '')}`}>
                  <PhoneIcon /> Call
                </a>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(logging)}
        onClose={() => setLogging(null)}
        title="Log a pour"
        subtitle={logging?.name}
        full
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
