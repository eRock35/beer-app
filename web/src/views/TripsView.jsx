import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, Field, Sheet, Spinner } from '../components/ui.jsx';
import { placeLine } from '../lib/format.js';

/**
 * Trips are the reason this app exists: you land somewhere for work with two
 * free evenings and want the good stops in walking order, not a list of
 * everything within fifty miles.
 */
export function TripsView() {
  const { aiEnabled } = useApp();
  const { data, loading, reload } = useAsync(() => api.list('trips'), []);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const trips = data?.items || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trips</h1>
          <p>
            Give it a city and it finds the breweries, puts them in walking order, and — if the
            sommelier is on — tells you what to order at each one.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setPlanning(true)}>
          ✈️ Plan a trip
        </button>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Banner kind="error">{error}</Banner></div>}

      {loading && <div className="skeleton" style={{ height: 160 }} />}

      {!loading && !trips.length && (
        <Empty
          icon="✈️"
          title="No trips planned"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setPlanning(true)}>
              Plan your first
            </button>
          }
        >
          Next time work sends you somewhere, plan the crawl before you land.
        </Empty>
      )}

      <div className="stack">
        {trips.map((trip) => (
          <article key={trip.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3>{trip.title}</h3>
                <p className="secondary" style={{ margin: '3px 0 0', fontSize: '0.9rem' }}>
                  {placeLine(trip.city, trip.state)}
                  {trip.startDate && ` · ${trip.startDate}${trip.endDate ? ` → ${trip.endDate}` : ''}`}
                </p>
              </div>
              <Confirm
                onConfirm={async () => {
                  await api.remove('trips', trip.id);
                  reload();
                }}
              >
                Delete
              </Confirm>
            </div>

            {trip.stops?.length > 0 && (
              <ol style={{ margin: '14px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                {trip.stops.map((stop, i) => (
                  <li key={`${stop.id || stop.name}-${i}`}>
                    <span style={{ fontWeight: 600 }}>{stop.name}</span>
                    {stop.walkMinutes != null && (
                      <span className="muted" style={{ fontSize: '0.84rem' }}>
                        {' '}· {stop.walkMinutes} min walk
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {trip.itinerary && (
              <>
                <hr className="divider" />
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.65 }} className="secondary">
                  {trip.itinerary}
                </div>
              </>
            )}
          </article>
        ))}
      </div>

      <Sheet open={planning} onClose={() => setPlanning(false)} title="Plan a trip" width={640}>
        <TripPlanner
          aiEnabled={aiEnabled}
          onSaved={() => {
            setPlanning(false);
            reload();
          }}
          onError={setError}
        />
      </Sheet>
    </>
  );
}

function TripPlanner({ aiEnabled, onSaved, onError }) {
  const [step, setStep] = useState('search');
  const [city, setCity] = useState('');
  const [nights, setNights] = useState(2);
  const [vibe, setVibe] = useState('');
  const [found, setFound] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [route, setRoute] = useState(null);
  const [itinerary, setItinerary] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const find = async (e) => {
    e.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      const data = await api.searchBreweries({ near: city, perPage: 40 });
      // Closed and planning-stage entries are noise for a trip.
      const usable = data.breweries.filter((b) => !['closed', 'planning'].includes(b.type));
      setFound(usable);
      setChosen(usable.slice(0, 5).map((b) => b.id));
      setStep('choose');
      if (!usable.length) setLocalError('No open breweries found there.');
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const buildRoute = async () => {
    setBusy(true);
    setLocalError('');
    try {
      const stops = found.filter((b) => chosen.includes(b.id));
      if (stops.length < 2) {
        setLocalError('Pick at least two stops.');
        return;
      }
      const result = await api.planRoute({
        stops: stops.map((b) => ({ id: b.id, name: b.name, city: b.city, state: b.state, lat: b.lat, lng: b.lng })),
        start: stops[0],
      });
      setRoute(result);
      setStep('route');
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const askSommelier = async () => {
    setBusy(true);
    setLocalError('');
    try {
      const { itinerary: text } = await api.tripPlan({
        city,
        nights: Number(nights),
        vibe,
        breweries: route.route.map((stop, i) => ({
          name: stop.name,
          city: stop.city,
          walkMinutes: route.legs[i]?.walkMinutes ?? null,
        })),
      });
      setItinerary(text);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const first = route.route[0];
      await api.add('trips', {
        title: `${city} — ${nights} ${Number(nights) === 1 ? 'night' : 'nights'}`,
        city,
        state: first?.state || '',
        lat: first?.lat ?? null,
        lng: first?.lng ?? null,
        stops: route.route.map((stop, i) => ({
          id: stop.id || '',
          name: stop.name,
          city: stop.city || '',
          state: stop.state || '',
          lat: stop.lat ?? null,
          lng: stop.lng ?? null,
          done: false,
          walkMinutes: route.legs[i]?.walkMinutes ?? null,
        })),
        itinerary,
        notes: vibe,
      });
      onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {localError && <div style={{ marginBottom: 14 }}><Banner kind="error">{localError}</Banner></div>}

      {step === 'search' && (
        <form onSubmit={find}>
          <Field label="Where is work sending you?" id="trip-city">
            <input
              id="trip-city"
              className="input"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Portland, OR"
            />
          </Field>
          <div className="row">
            <Field label="Free evenings" id="trip-nights">
              <input
                id="trip-nights"
                className="input"
                type="number"
                min="1"
                max="14"
                value={nights}
                onChange={(e) => setNights(e.target.value)}
              />
            </Field>
          </div>
          <Field label="What are you after?" id="trip-vibe" hint="Optional. Steers the sommelier's picks.">
            <input
              id="trip-vibe"
              className="input"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="Lagers and something barrel-aged. No pastry stouts."
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <Spinner /> : 'Find breweries'}
          </button>
        </form>
      )}

      {step === 'choose' && (
        <div>
          <p className="secondary" style={{ fontSize: '0.9rem' }}>
            {found.length} open breweries near {city}. Pick the ones worth your evenings — three to
            five makes a good crawl.
          </p>
          <div style={{ maxHeight: 340, overflowY: 'auto', margin: '12px 0', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            {found.map((b) => (
              <label
                key={b.id}
                style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'flex-start' }}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(b.id)}
                  onChange={(e) =>
                    setChosen((c) => (e.target.checked ? [...c, b.id] : c.filter((id) => id !== b.id)))
                  }
                  style={{ marginTop: 4, accentColor: 'var(--brand)' }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: 'block' }}>{b.name}</span>
                  <span className="secondary" style={{ fontSize: '0.84rem' }}>
                    {[b.type, placeLine(b.city, b.state)].filter(Boolean).join(' · ')}
                    {b.distanceMiles != null && ` · ${b.distanceMiles.toFixed(1)} mi`}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setStep('search')}>Back</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={buildRoute} disabled={busy}>
              {busy ? <Spinner /> : `Order ${chosen.length} stops into a crawl`}
            </button>
          </div>
        </div>
      )}

      {step === 'route' && route && (
        <div>
          <div className="card card-tight" style={{ marginBottom: 14 }}>
            <strong>{route.totalMiles} mi total</strong>
            <span className="secondary"> · about {route.totalWalkMinutes} min on foot · </span>
            <span style={{ color: route.walkable ? 'var(--good)' : 'var(--warning)', fontWeight: 600 }}>
              {route.walkable ? 'walkable' : 'you will want a car or rideshare'}
            </span>
          </div>

          <ol style={{ paddingLeft: 20, display: 'grid', gap: 8, marginTop: 0 }}>
            {route.route.map((stop, i) => (
              <li key={stop.id || stop.name}>
                <span style={{ fontWeight: 600 }}>{stop.name}</span>
                {i > 0 && (
                  <span className="muted" style={{ fontSize: '0.84rem' }}>
                    {' '}· {route.legs[i].miles} mi / {route.legs[i].walkMinutes} min from the last stop
                  </span>
                )}
              </li>
            ))}
          </ol>

          {aiEnabled && (
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 16 }}
              onClick={askSommelier}
              disabled={busy}
            >
              {busy ? <Spinner /> : '🎩 Ask the sommelier what to order'}
            </button>
          )}

          {itinerary && (
            <div className="card card-tight" style={{ marginTop: 14, whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '0.92rem' }}>
              {itinerary}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setStep('choose')}>Back</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>
              Save this trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
