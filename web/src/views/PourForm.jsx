import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../store.jsx';
import { Banner, Field, FormGroup, ScorePill, Sheet, Spinner } from '../components/ui.jsx';
import { CameraIcon, SparkleIcon } from '../components/icons.jsx';
import { ScanSheet } from '../components/ScanSheet.jsx';

const EMPTY = {
  beerName: '',
  brewery: '',
  breweryId: '',
  style: 'Hazy IPA',
  abv: '',
  ibu: '',
  servingFormat: 'draft',
  scores: {},
  tags: [],
  notes: '',
  photoUrl: '',
  city: '',
  state: '',
  country: '',
  lat: null,
  lng: null,
  visibility: 'public',
};

/** Mirrors the server's weighting so the score updates as you drag. */
function previewScore(scores, axes) {
  let total = 0;
  let weight = 0;
  for (const axis of axes) {
    const v = Number(scores[axis.key]);
    if (!Number.isFinite(v)) continue;
    total += v * axis.weight;
    weight += axis.weight;
  }
  return weight ? Math.round((total / weight) * 10) : null;
}

export function PourForm({ preset = {}, existing, onSaved, onCancel }) {
  const { reference, aiEnabled } = useApp();
  const axes = reference?.axes || [];
  const styles = reference?.styles || [];
  const flavourTags = reference?.flavourTags || [];

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...preset,
    ...(existing || {}),
    abv: existing?.abv ?? preset.abv ?? '',
    ibu: existing?.ibu ?? preset.ibu ?? '',
    scores: existing?.scores || {},
    tags: existing?.tags || [],
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [scanning, setScanning] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setScore = (key, value) => setForm((f) => ({ ...f, scores: { ...f.scores, [key]: value } }));

  const score = useMemo(() => previewScore(form.scores, axes), [form.scores, axes]);

  const toggleTag = (tag) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));

  const visibleTags = useMemo(() => {
    const needle = tagFilter.trim().toLowerCase();
    const pool = needle ? flavourTags.filter((t) => t.includes(needle)) : flavourTags;
    // Chosen tags stay pinned at the front so they never scroll out of reach.
    return [...form.tags, ...pool.filter((t) => !form.tags.includes(t))].slice(0, needle ? 40 : 34);
  }, [flavourTags, tagFilter, form.tags]);

  /**
   * Takes a scan and fills in only what a photo can honestly supply: the label
   * details and the Appearance axis. The other four axes stay untouched.
   */
  const applyScan = (result) => {
    setForm((f) => {
      const knownStyle = styles.some((s) => s.name === result.style);
      return {
        ...f,
        beerName: result.beerName || f.beerName,
        brewery: result.brewery || f.brewery,
        style: knownStyle ? result.style : f.style,
        abv: result.abv ?? f.abv,
        scores: result.appearanceScore != null
          ? { ...f.scores, appearance: result.appearanceScore }
          : f.scores,
        tags: [...new Set([...f.tags, ...(result.tags || [])])],
        notes: result.appearanceNote && !f.notes
          ? `Appearance: ${result.appearanceNote}`
          : f.notes,
      };
    });
    setScanning(false);
  };

  const polish = async () => {
    if (!form.notes.trim()) {
      setError('Write a few rough words first — the sommelier tidies, it does not invent.');
      return;
    }
    setPolishing(true);
    setError('');
    try {
      const { notes } = await api.polishNotes({
        beerName: form.beerName || 'this beer',
        brewery: form.brewery,
        style: form.style,
        rough: form.notes,
        scores: form.scores,
      });
      set('notes', notes);
    } catch (err) {
      setError(err.message);
    } finally {
      setPolishing(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        abv: form.abv === '' ? null : Number(form.abv),
        ibu: form.ibu === '' ? null : Number(form.ibu),
        lat: form.lat ?? null,
        lng: form.lng ?? null,
        scores: Object.fromEntries(
          Object.entries(form.scores).filter(([, v]) => Number.isFinite(Number(v)))
            .map(([k, v]) => [k, Number(v)])
        ),
      };
      // Server-managed fields must not be echoed back on an edit.
      delete payload.id;
      delete payload.userId;
      delete payload.score;
      delete payload.verdict;
      delete payload.family;
      delete payload.author;
      delete payload.cheerCount;
      delete payload.cheered;
      delete payload.commentCount;
      delete payload.createdAt;
      delete payload.updatedAt;

      const saved = existing
        ? await api.updatePour(existing.id, payload)
        : await api.createPour(payload);
      onSaved?.(saved.pour);
    } catch (err) {
      setError(err.details?.length ? `${err.message} ${err.details.map((d) => `${d.field}: ${d.message}`).join('; ')}` : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {aiEnabled && !existing && (
        <button
          type="button"
          className="btn btn-block btn-lg scan-cta"
          onClick={() => setScanning(true)}
          style={{ marginBottom: 16 }}
        >
          <CameraIcon /> Scan the can or the glass
        </button>
      )}

      <FormGroup>
        <Field label="Beer" id="pf-name">
          <input
            id="pf-name"
            className="input"
            required
            value={form.beerName}
            onChange={(e) => set('beerName', e.target.value)}
            placeholder="Beer: Barrel Aged"
            autoCapitalize="words"
            autoComplete="off"
            enterKeyHint="next"
          />
        </Field>
        <Field label="Brewery" id="pf-brewery">
          <input
            id="pf-brewery"
            className="input"
            value={form.brewery}
            onChange={(e) => set('brewery', e.target.value)}
            placeholder="Side Project Brewing"
            autoCapitalize="words"
            autoComplete="off"
            enterKeyHint="next"
          />
        </Field>

        <Field label="Style" id="pf-style">
          <select id="pf-style" className="select" value={form.style} onChange={(e) => set('style', e.target.value)}>
            {styles.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row row-keep">
          <Field label="ABV %" id="pf-abv">
            <input
              id="pf-abv"
              className="input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="80"
              value={form.abv}
              onChange={(e) => set('abv', e.target.value)}
              enterKeyHint="next"
            />
          </Field>
          <Field label="Serving" id="pf-format">
            <select
              id="pf-format"
              className="select"
              value={form.servingFormat}
              onChange={(e) => set('servingFormat', e.target.value)}
            >
              {['draft', 'can', 'bottle', 'crowler', 'cask', 'taster'].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormGroup>

      <FormGroup>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <div className="card-title">Score it</div>
            <div className="hint">
              Flavour carries the most weight, appearance the least. Axes you never touch stay
              unscored and are left out of the total.
            </div>
          </div>
          <ScorePill score={score} />
        </div>

        {axes.map((axis) => {
          const value = form.scores[axis.key];
          const shown = value ?? 5;
          return (
            <div key={axis.key} className="score-row">
              <label htmlFor={`pf-${axis.key}`} className="score-row-head">
                <span className="label">
                  {axis.label} <span className="score-row-weight">· {Math.round(axis.weight * 100)}%</span>
                </span>
                <span className="score-row-value">
                  {value == null ? '—' : Number(value).toFixed(1)}
                </span>
              </label>
              <input
                id={`pf-${axis.key}`}
                type="range"
                className={`slider${value == null ? ' is-unset' : ''}`}
                min="0"
                max="10"
                step="0.5"
                value={shown}
                onChange={(e) => setScore(axis.key, Number(e.target.value))}
                // Dimmed until touched, so a thumb resting at the midpoint does not
                // read as a deliberate 5.
                style={{ '--pct': `${(shown / 10) * 100}%` }}
                aria-describedby={`pf-${axis.key}-hint`}
                aria-valuetext={value == null ? 'not scored' : `${value} out of 10`}
              />
              <div className="hint" id={`pf-${axis.key}-hint`}>{axis.hint}</div>
            </div>
          );
        })}
      </FormGroup>

      <FormGroup>
        <Field label="Flavours" hint="Tagging keeps your notes searchable a year from now.">
          <input
            className="input"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Filter the list — bourbon, citrus, funk…"
            aria-label="Filter flavour tags"
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="search"
            style={{ marginBottom: 10 }}
          />
          <div className="chips">
            {visibleTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="chip chip-toggle"
                aria-pressed={form.tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </Field>
      </FormGroup>

      <FormGroup>
        <Field label="Notes" id="pf-notes">
          <textarea
            id="pf-notes"
            className="textarea"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="What did it actually taste like? Write it rough — you can tidy it after."
            autoCapitalize="sentences"
          />
          {aiEnabled && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={polish}
              disabled={polishing}
              style={{ alignSelf: 'flex-start', marginTop: 6 }}
            >
              {polishing ? <Spinner /> : <><SparkleIcon /> Tidy these notes</>}
            </button>
          )}
        </Field>
      </FormGroup>

      <FormGroup>
        <div className="row row-keep">
          <Field label="City" id="pf-city">
            <input id="pf-city" className="input" value={form.city} onChange={(e) => set('city', e.target.value)} autoCapitalize="words" autoComplete="off" enterKeyHint="next" />
          </Field>
          <Field label="State" id="pf-state">
            <input id="pf-state" className="input" value={form.state} onChange={(e) => set('state', e.target.value)} autoCapitalize="characters" autoComplete="off" enterKeyHint="done" />
          </Field>
        </div>
        <Field label="Visibility" id="pf-vis">
          <select
            id="pf-vis"
            className="select"
            value={form.visibility}
            onChange={(e) => set('visibility', e.target.value)}
          >
            <option value="public">Show in the feed</option>
            <option value="private">Keep private</option>
          </select>
        </Field>
      </FormGroup>

      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Spinner /> : existing ? 'Save changes' : 'Add to journal'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <Sheet
        open={scanning}
        onClose={() => setScanning(false)}
        title="Scan a beer"
        subtitle="Label for the facts, glass for the appearance score"
        full
      >
        <ScanSheet onApply={applyScan} onClose={() => setScanning(false)} />
      </Sheet>
    </form>
  );
}
