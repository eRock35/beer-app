import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, Field, Sheet, Spinner } from '../components/ui.jsx';
import { relativeDate } from '../lib/format.js';

const KIND_LABEL = {
  release: 'Release',
  distribution: 'New distribution',
  'taproom-only': 'Taproom only',
  festival: 'Festival',
  closing: 'Closing',
  other: 'News',
};

const CONFIDENCE_NOTE = {
  confirmed: 'A source states this outright.',
  likely: 'Strongly implied, not confirmed.',
  rumour: 'Unconfirmed chatter — treat it as a lead.',
};

/**
 * Dispatch: watches for beer news in places you care about.
 *
 * Worth being straight about what this is. Nobody publishes an API of beer
 * distribution — where a pallet is going next Thursday is not public data. What
 * is public is what breweries, shops and beer press post on the open web. So a
 * scan is a real web search, and every find carries the link it came from and
 * an honest confidence rating. It will miss things. It is a scout, not a feed.
 */
export function DispatchView({ go }) {
  const { aiEnabled, user } = useApp();
  const { data, loading, reload } = useAsync(() => api.dispatch(), []);
  const [adding, setAdding] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [error, setError] = useState('');
  const [lastScan, setLastScan] = useState(null);

  const watches = data?.watches || [];
  const finds = data?.finds || [];

  const scan = async (watch) => {
    setScanningId(watch.id);
    setError('');
    setLastScan(null);
    try {
      const result = await api.scanWatch(watch.id);
      setLastScan({ watch, ...result });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanningId(null);
    }
  };

  const dismiss = async (find) => {
    try {
      await api.updateFind(find.id, { dismissed: true });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!aiEnabled) {
    return (
      <Empty
        icon="📡"
        title="Dispatch needs the sommelier"
        action={<button type="button" className="btn" onClick={() => go('map')}>Back to the map</button>}
      >
        Scanning for releases means searching the live web, which runs through Claude. Set{' '}
        <code>ANTHROPIC_API_KEY</code> on the server to switch it on.
      </Empty>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dispatch</h1>
          <p>
            Watch a brewery or a style in the places you pass through, and have the open web
            searched for what is actually landing there.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          📡 Add a watch
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Banner>
          There is no public feed of beer distribution — where a pallet goes next week simply is not
          published. This searches what breweries, shops and beer press post openly, links every
          source, and marks how confident it is. It will miss things. Check before you drive.
        </Banner>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Banner kind="error">{error}</Banner></div>}

      {loading && <div className="skeleton" style={{ height: 150 }} />}

      {!loading && !watches.length && (
        <Empty
          icon="📡"
          title="Nothing being watched"
          action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add your first watch</button>}
        >
          Watch {user.whiteWhaleBrewery || 'a brewery you chase'} in{' '}
          {user.homeCity || 'your home city'} and anywhere work keeps sending you.
        </Empty>
      )}

      {watches.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ marginBottom: 12 }}>Watching</h2>
          <div className="grid grid-2">
            {watches.map((watch) => (
              <div key={watch.id} className="card card-tight">
                <div className="watch-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>
                      {watch.kind === 'anything' ? 'Anything good' : watch.target}
                    </div>
                    <div className="secondary" style={{ fontSize: '0.85rem' }}>
                      {watch.places.map((p) => p.label).join(' · ')}
                    </div>
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                      within {watch.radiusMiles} mi ·{' '}
                      {watch.lastScanAt ? `scanned ${relativeDate(watch.lastScanAt)}` : 'never scanned'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => scan(watch)}
                    disabled={scanningId === watch.id}
                  >
                    {scanningId === watch.id ? <Spinner label="Searching" /> : '🔎 Scan now'}
                  </button>
                  <Confirm
                    onConfirm={async () => {
                      await api.removeWatch(watch.id);
                      reload();
                    }}
                  >
                    Remove
                  </Confirm>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {lastScan && (
        <div className="card card-tight" style={{ marginBottom: 20 }}>
          <div className="chart-title">
            Last scan: {lastScan.watch.kind === 'anything' ? 'anything good' : lastScan.watch.target}
          </div>
          <p className="secondary" style={{ fontSize: '0.9rem', margin: '6px 0 0' }}>
            {lastScan.newCount
              ? `${lastScan.newCount} new ${lastScan.newCount === 1 ? 'find' : 'finds'}. `
              : 'Nothing new. '}
            {lastScan.summary}
          </p>
          {lastScan.sources?.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 10 }}>Sources consulted</div>
              <ul className="list-reset source-list">
                {lastScan.sources.slice(0, 8).map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {finds.length > 0 && (
        <section>
          <h2 style={{ marginBottom: 12 }}>Incoming</h2>
          <div className="stack">
            {finds.map((find) => (
              <article key={find.id} className={`card find-card is-${find.confidence}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <span className="chip" style={{ marginBottom: 6 }}>{KIND_LABEL[find.kind] || 'News'}</span>
                    <h3 style={{ margin: '4px 0 0' }}>{find.headline}</h3>
                    <div className="find-meta">
                      {find.brewery && <span>🏭 {find.brewery}</span>}
                      {find.beer && <span>🍺 {find.beer}</span>}
                      {find.place && <span>📍 {find.place}</span>}
                      {find.when && <span>🗓 {find.when}</span>}
                    </div>
                  </div>
                </div>

                {find.why && (
                  <p className="secondary" style={{ fontSize: '0.9rem', margin: '12px 0 0', lineHeight: 1.6 }}>
                    {find.why}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    className="chip"
                    title={CONFIDENCE_NOTE[find.confidence]}
                    style={{
                      borderColor:
                        find.confidence === 'confirmed'
                          ? 'var(--good)'
                          : find.confidence === 'rumour'
                            ? 'var(--warning)'
                            : 'var(--series-1)',
                    }}
                  >
                    {find.confidence}
                  </span>
                  {find.sourceUrl ? (
                    <a className="btn btn-sm" href={find.sourceUrl} target="_blank" rel="noreferrer noopener">
                      Source ↗
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>No verifiable source link</span>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => dismiss(find)} style={{ marginLeft: 'auto' }}>
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a watch">
        <WatchForm
          user={user}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </>
  );
}

function WatchForm({ user, onSaved, onCancel }) {
  const [kind, setKind] = useState('brewery');
  const [target, setTarget] = useState(user.whiteWhaleBrewery || '');
  const [placeText, setPlaceText] = useState(
    [user.homeCity, user.homeState].filter(Boolean).join(', ')
  );
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const places = placeText
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label }));

    if (!places.length) {
      setError('Give it at least one place to watch.');
      return;
    }
    if (kind !== 'anything' && !target.trim()) {
      setError('Say what you are watching for.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.addWatch({
        kind,
        target: target.trim(),
        places,
        radiusMiles: Number(radiusMiles) || 50,
        note: note.trim(),
        active: true,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Field label="Watch for" id="w-kind">
        <select id="w-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="brewery">A specific brewery</option>
          <option value="style">A style</option>
          <option value="anything">Anything good</option>
        </select>
      </Field>

      {kind !== 'anything' && (
        <Field
          label={kind === 'brewery' ? 'Brewery' : 'Style'}
          id="w-target"
          hint={kind === 'brewery' ? 'The one you would reroute a trip for.' : 'e.g. barrel-aged stout, gueuze, Italian pilsner'}
        >
          <input
            id="w-target"
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={kind === 'brewery' ? 'Side Project Brewing' : 'Barrel-aged stout'}
          />
        </Field>
      )}

      <Field label="Places" id="w-places" hint="One per line. Home, plus wherever work keeps sending you.">
        <textarea
          id="w-places"
          className="textarea"
          value={placeText}
          onChange={(e) => setPlaceText(e.target.value)}
          placeholder={'St. Louis, MO\nChicago, IL\nDenver, CO'}
          style={{ minHeight: 84 }}
        />
      </Field>

      <Field label="Radius (miles)" id="w-radius">
        <input
          id="w-radius"
          className="input"
          type="number"
          min="1"
          max="500"
          value={radiusMiles}
          onChange={(e) => setRadiusMiles(e.target.value)}
        />
      </Field>

      <Field label="Anything else?" id="w-note" hint="Optional. Steers what counts as worth telling you about.">
        <input
          id="w-note"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Only bottle releases, not merch drops"
        />
      </Field>

      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? <Spinner /> : 'Start watching'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
