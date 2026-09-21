import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, ErrorState, Field, FormGroup, LoadingList, Sheet, Spinner, useToast } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { CalendarIcon, MapPinIcon, PlusIcon, SignpostIcon, SparkleIcon } from '../components/icons.jsx';
import { placeLine } from '../lib/format.js';

/**
 * Trips are the reason this app exists: you land somewhere for work with two
 * free evenings and want the good stops in walking order, not a list of
 * everything within fifty miles.
 */
export function TripsView() {
  const { aiEnabled, user } = useApp();
  const toast = useToast();
  // Signed out there is nothing to list and no point asking - the planner
  // below works without an account.
  const { data, loading, error, reload } = useAsync(() => api.list('trips'), [user], { enabled: Boolean(user) });
  const [planning, setPlanning] = useState(false);
  const trips = data?.items || [];

  return (
    <>
      <PageTitle
        eyebrow="Crawl planner"
        title="Trips"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setPlanning(true)}>
            <PlusIcon /> Plan a trip
          </button>
        }
      >
        Give it a city and it finds the breweries, puts them in walking order, and — if the
        sommelier is on — tells you what to order at each one.
      </PageTitle>

      {loading && <LoadingList rows={2} height={150} />}

      {error && !loading && (
        <ErrorState title="Could not load your trips" onRetry={reload}>{error}</ErrorState>
      )}

      {!loading && !error && !trips.length && (
        <Empty
          icon={<SignpostIcon />}
          title="No trips planned"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setPlanning(true)}>
              Plan your first
            </button>
          }
        >
          {user
            ? 'Next time work sends you somewhere, plan the crawl before you land.'
            : 'Plan a crawl right here. Sign in when you want to keep it.'}
        </Empty>
      )}

      <div className="stack">
        {trips.map((trip) => (
          <article key={trip.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h3 className="card-title">{trip.title}</h3>
                <p className="card-sub meta-line">
                  <span><MapPinIcon />{placeLine(trip.city, trip.state)}</span>
                  {trip.startDate && (
                    <span><CalendarIcon />{trip.startDate}{trip.endDate ? ` → ${trip.endDate}` : ''}</span>
                  )}
                </p>
              </div>
              <Confirm
                title={`Delete ${trip.title}?`}
                message="The route and any itinerary go with it."
                onConfirm={async () => {
                  try {
                    await api.remove('trips', trip.id);
                    toast('Trip deleted', { kind: 'success' });
                    reload();
                  } catch (err) {
                    toast(err.message, { kind: 'error' });
                  }
                }}
              >
                Delete
              </Confirm>
            </div>

            {trip.stops?.length > 0 && (
              <ol className="list-reset" style={{ margin: '12px 0 0', display: 'grid' }}>
                {trip.stops.map((stop, i) => (
                  <li key={`${stop.id || stop.name}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderTop: i ? '1px solid var(--sep)' : 0 }}>
                    <span className="muted tabular" style={{ width: 20, fontWeight: 700, fontSize: 14, flex: '0 0 auto' }}>{i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 16, display: 'block' }}>{stop.name}</span>
                      {stop.walkMinutes != null && (
                        <span className="muted" style={{ fontSize: 13 }}>{stop.walkMinutes} min walk</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {trip.itinerary && (
              <>
                <hr className="divider" />
                <div className="secondary" style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.55, userSelect: 'text', WebkitUserSelect: 'text' }}>
                  {trip.itinerary}
                </div>
              </>
            )}
          </article>
        ))}
      </div>

      <Sheet open={planning} onClose={() => setPlanning(false)} title="Plan a trip" width={640} full>
        <TripPlanner
          user={user}
          aiEnabled={aiEnabled}
          onSaved={() => {
            setPlanning(false);
            toast('Trip saved', { kind: 'success' });
            reload();
          }}
          onError={(message) => toast(message, { kind: 'error' })}
        />
      </Sheet>
    </>
  );
}

function TripPlanner({ user, aiEnabled, onSaved, onError }) {
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
          <FormGroup>
            <Field label="Where is work sending you?" id="trip-city">
              <input
                id="trip-city"
                className="input"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Portland, OR"
                autoCapitalize="words"
                autoComplete="off"
                enterKeyHint="next"
              />
            </Field>
            <Field label="Free evenings" id="trip-nights">
              <input
                id="trip-nights"
                className="input"
                type="number"
                inputMode="numeric"
                min="1"
                max="14"
                value={nights}
                onChange={(e) => setNights(e.target.value)}
                enterKeyHint="next"
              />
            </Field>
            <Field label="What are you after?" id="trip-vibe" hint="Optional. Steers the sommelier's picks.">
              <input
                id="trip-vibe"
                className="input"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                placeholder="Lagers and something barrel-aged. No pastry stouts."
                autoCapitalize="sentences"
                autoComplete="off"
                enterKeyHint="search"
              />
            </Field>
          </FormGroup>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? <Spinner /> : 'Find breweries'}
          </button>
        </form>
      )}

      {step === 'choose' && (
        <div>
          <p className="secondary" style={{ fontSize: 15 }}>
            {found.length} open breweries near {city}. Pick the ones worth your evenings — three to
            five makes a good crawl.
          </p>
          <div className="group-body" style={{ maxHeight: 360, overflowY: 'auto', margin: '12px 0 14px' }}>
            {found.map((b, i) => (
              <label
                key={b.id}
                className="list-row"
                style={{ cursor: 'pointer', alignItems: 'flex-start' }}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(b.id)}
                  onChange={(e) =>
                    setChosen((c) => (e.target.checked ? [...c, b.id] : c.filter((id) => id !== b.id)))
                  }
                  style={{ marginTop: 3, flex: '0 0 auto' }}
                />
                <span className="row-text">
                  <span className="row-title" style={{ fontWeight: 600, fontSize: 16 }}>{b.name}</span>
                  <span className="row-subtitle">
                    {[b.type, placeLine(b.city, b.state)].filter(Boolean).join(' · ')}
                    {b.distanceMiles != null && ` · ${b.distanceMiles.toFixed(1)} mi`}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={buildRoute} disabled={busy}>
              {busy ? <Spinner /> : `Order ${chosen.length} stops into a crawl`}
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep('search')}>Back</button>
          </div>
        </div>
      )}

      {step === 'route' && route && (
        <div>
          <div className="card card-tight" style={{ marginBottom: 14, background: 'var(--fill)', boxShadow: 'none' }}>
            <strong className="tabular">{route.totalMiles} mi total</strong>
            <span className="secondary"> · about {route.totalWalkMinutes} min on foot · </span>
            <span style={{ color: route.walkable ? 'var(--good)' : 'var(--warning)', fontWeight: 600 }}>
              {route.walkable ? 'walkable' : 'you will want a car or rideshare'}
            </span>
          </div>

          <ol className="list-reset" style={{ display: 'grid' }}>
            {route.route.map((stop, i) => (
              <li key={stop.id || stop.name} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: i ? '1px solid var(--sep)' : 0 }}>
                <span className="muted tabular" style={{ width: 20, fontWeight: 700, flex: '0 0 auto' }}>{i + 1}</span>
                <span>
                  <span style={{ fontWeight: 600, display: 'block' }}>{stop.name}</span>
                  {i > 0 && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {route.legs[i].miles} mi / {route.legs[i].walkMinutes} min from the last stop
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {aiEnabled && (
            <button
              type="button"
              className="btn btn-secondary btn-block btn-lg"
              style={{ marginTop: 16 }}
              onClick={askSommelier}
              disabled={busy}
            >
              {busy ? <Spinner /> : <><SparkleIcon /> Ask the sommelier what to order</>}
            </button>
          )}

          {itinerary && (
            <div className="card card-tight" style={{ marginTop: 14, whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 15, background: 'var(--fill)', boxShadow: 'none', userSelect: 'text', WebkitUserSelect: 'text' }}>
              {itinerary}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 16 }}>
            {user ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={save} disabled={busy}>
                Save this trip
              </button>
            ) : (
              <p className="secondary" style={{ margin: '0 0 10px', fontSize: 15 }}>Sign in to keep this crawl on your phone.</p>
            )}
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep('choose')}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
