import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, ErrorState, Field, FormGroup, LoadingList, Sheet, Spinner, useToast } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { AntennaIcon, CalendarIcon, FactoryIcon, GlassIcon, MapPinIcon, PlusIcon, SearchIcon, ArrowUpRightIcon } from '../components/icons.jsx';
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
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.dispatch(), [], { enabled: aiEnabled });
  const [adding, setAdding] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [lastScan, setLastScan] = useState(null);

  const watches = data?.watches || [];
  const finds = data?.finds || [];

  const scan = async (watch) => {
    setScanningId(watch.id);
    setLastScan(null);
    try {
      const result = await api.scanWatch(watch.id);
      setLastScan({ watch, ...result });
      toast(result.newCount ? `${result.newCount} new ${result.newCount === 1 ? 'find' : 'finds'}` : 'Nothing new', { kind: 'success' });
      reload();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setScanningId(null);
    }
  };

  const dismiss = async (find) => {
    try {
      await api.updateFind(find.id, { dismissed: true });
      reload();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };

  if (!aiEnabled) {
    return (
      <>
        <PageTitle eyebrow="Beer news scout" title="Dispatch" />
        <Empty
          icon={<AntennaIcon />}
          title="Dispatch needs the sommelier"
          action={<button type="button" className="btn btn-secondary" onClick={() => go('map')}>Back to the map</button>}
        >
          Scanning for releases means searching the live web, which runs through Claude. Set{' '}
          <code>ANTHROPIC_API_KEY</code> on the server to switch it on.
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageTitle
        eyebrow="Beer news scout"
        title="Dispatch"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <PlusIcon /> Add a watch
          </button>
        }
      >
        Watch a brewery or a style in the places you pass through, and have the open web
        searched for what is actually landing there.
      </PageTitle>

      <div style={{ marginBottom: 16 }}>
        <Banner>
          There is no public feed of beer distribution — where a pallet goes next week simply is not
          published. This searches what breweries, shops and beer press post openly, links every
          source, and marks how confident it is. It will miss things. Check before you drive.
        </Banner>
      </div>

      {loading && <LoadingList rows={2} height={120} />}

      {error && !loading && (
        <ErrorState title="Could not load your watches" onRetry={reload}>{error}</ErrorState>
      )}

      {!loading && !error && !watches.length && (
        <Empty
          icon={<AntennaIcon />}
          title="Nothing being watched"
          action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add your first watch</button>}
        >
          Watch {user.whiteWhaleBrewery || 'a brewery you chase'} in{' '}
          {user.homeCity || 'your home city'} and anywhere work keeps sending you.
        </Empty>
      )}

      {watches.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">Watching</h2>
          <div className="grid grid-2">
            {watches.map((watch) => (
              <div key={watch.id} className="card card-tight">
                <div className="watch-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card-title">
                      {watch.kind === 'anything' ? 'Anything good' : watch.target}
                    </div>
                    <div className="card-sub">
                      {watch.places.map((p) => p.label).join(' · ')}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                      within {watch.radiusMiles} mi ·{' '}
                      {watch.lastScanAt ? `scanned ${relativeDate(watch.lastScanAt)}` : 'never scanned'}
                    </div>
                  </div>
                </div>
                <div className="card-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => scan(watch)}
                    disabled={scanningId === watch.id}
                  >
                    {scanningId === watch.id ? <Spinner label="Searching" /> : <><SearchIcon /> Scan now</>}
                  </button>
                  <Confirm
                    title="Stop watching?"
                    message="Existing finds stay; nothing new arrives for this watch."
                    onConfirm={async () => {
                      try {
                        await api.removeWatch(watch.id);
                        toast('Watch removed', { kind: 'success' });
                        reload();
                      } catch (err) {
                        toast(err.message, { kind: 'error' });
                      }
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
          <p className="secondary" style={{ fontSize: 15, margin: '6px 0 0' }}>
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
                    <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {finds.length > 0 && (
        <section>
          <h2 className="section-title">Incoming</h2>
          <div className="stack">
            {finds.map((find) => (
              <article key={find.id} className={`card find-card is-${find.confidence}`}>
                <div style={{ minWidth: 0 }}>
                  <span className="chip chip-sm">{KIND_LABEL[find.kind] || 'News'}</span>
                  <h3 className="card-title" style={{ margin: '8px 0 0' }}>{find.headline}</h3>
                  <div className="find-meta">
                    {find.brewery && <span><FactoryIcon />{find.brewery}</span>}
                    {find.beer && <span><GlassIcon />{find.beer}</span>}
                    {find.place && <span><MapPinIcon />{find.place}</span>}
                    {find.when && <span><CalendarIcon />{find.when}</span>}
                  </div>
                </div>

                {find.why && <p className="card-text">{find.why}</p>}

                <div className="card-actions">
                  <span
                    className="chip chip-sm"
                    title={CONFIDENCE_NOTE[find.confidence]}
                    style={{
                      boxShadow: `inset 0 0 0 1.5px ${
                        find.confidence === 'confirmed'
                          ? 'var(--good)'
                          : find.confidence === 'rumour'
                            ? 'var(--warning)'
                            : 'var(--series-1)'
                      }`,
                      flex: '0 0 auto',
                    }}
                  >
                    {find.confidence}
                  </span>
                  {find.sourceUrl ? (
                    <a className="btn btn-sm btn-secondary" href={find.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: '0 0 auto' }}>
                      Source <ArrowUpRightIcon />
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>No verifiable source link</span>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => dismiss(find)} style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a watch" full>
        <WatchForm
          user={user}
          onSaved={() => {
            setAdding(false);
            toast('Watching', { kind: 'success' });
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
      <FormGroup>
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
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="next"
            />
          </Field>
        )}
      </FormGroup>

      <FormGroup>
        <Field label="Places" id="w-places" hint="One per line. Home, plus wherever work keeps sending you.">
          <textarea
            id="w-places"
            className="textarea"
            value={placeText}
            onChange={(e) => setPlaceText(e.target.value)}
            placeholder={'St. Louis, MO\nChicago, IL\nDenver, CO'}
            style={{ minHeight: 88 }}
            autoCapitalize="words"
          />
        </Field>

        <Field label="Radius (miles)" id="w-radius">
          <input
            id="w-radius"
            className="input"
            type="number"
            inputMode="numeric"
            min="1"
            max="500"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(e.target.value)}
            enterKeyHint="next"
          />
        </Field>
      </FormGroup>

      <FormGroup>
        <Field label="Anything else?" id="w-note" hint="Optional. Steers what counts as worth telling you about.">
          <input
            id="w-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Only bottle releases, not merch drops"
            autoCapitalize="sentences"
            autoComplete="off"
            enterKeyHint="done"
          />
        </Field>
      </FormGroup>

      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Spinner /> : 'Start watching'}
        </button>
        <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
