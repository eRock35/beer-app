import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { downscaleToDataUrl } from '../lib/image.js';
import { Banner, Field, FormGroup, Spinner } from './ui.jsx';
import { AlertIcon, CameraIcon, CheckIcon, SearchIcon } from './icons.jsx';

const CLARITY_HELP = {
  brilliant: 'Star-bright. Nothing in suspension.',
  clear: 'Clean, with only a trace of anything.',
  'slight haze': 'A faint veil — could be chill haze.',
  hazy: 'Properly turbid, as a modern IPA should be.',
  opaque: 'No light through it at all.',
  unknown: 'Could not tell from the photo.',
};

/**
 * Reads a photo of a can or a poured beer.
 *
 * The UI is built around one honest distinction: what Claude can see, it
 * scores; what it cannot taste, it refuses to score. The appearance result is
 * offered as a real score; everything else is either read off the label or
 * labelled as a style expectation.
 */
export function ScanSheet({ onApply, onClose }) {
  const [preview, setPreview] = useState(null);
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const fileRef = useRef(null);
  const libraryRef = useRef(null);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setScan(null);
    setLookup(null);
    try {
      const { dataUrl } = await downscaleToDataUrl(file);
      setPreview(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const run = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const { scan: result } = await api.scan({ image: preview, hint: hint || undefined });
      setScan(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runLookup = async () => {
    setLookingUp(true);
    try {
      const result = await api.lookup({
        beerName: scan.identified?.beerName || '',
        brewery: scan.identified?.brewery || '',
      });
      setLookup(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLookingUp(false);
    }
  };

  const apply = () => {
    onApply({
      beerName: scan.identified?.beerName || '',
      brewery: scan.identified?.brewery || '',
      style: scan.identified?.style || '',
      abv: scan.abv?.value ?? null,
      appearanceScore: scan.appearance?.score ?? null,
      appearanceNote: scan.appearance?.reasoning || '',
      tags: [scan.appearance?.clarity, ...(scan.appearance?.headRetention === 'excellent' ? ['creamy'] : [])]
        .filter((t) => t && t !== 'unknown'),
    });
  };

  const identified = scan?.identified;
  const appearance = scan?.appearance;

  return (
    <div>
      {!preview && (
        <div className="scan-drop">
          <span className="empty-icon" aria-hidden="true"><CameraIcon /></span>
          <p className="secondary" style={{ maxWidth: '40ch', margin: '0 auto 16px', fontSize: 15 }}>
            Shoot the <strong>can or bottle</strong> to pull the name, brewery, style and ABV off
            the label. Shoot the <strong>glass</strong> to have the appearance judged — colour,
            haziness, head, lacing.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()}>
              <CameraIcon /> Take a photo
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => libraryRef.current?.click()}>
              Choose from library
            </button>
          </div>
          {/* `capture` sends iOS straight to the camera; the second input is the photo library. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={choose}
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            onChange={choose}
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      )}

      {preview && (
        <>
          <div className="scan-preview">
            <img src={preview} alt="The beer you photographed" />
          </div>

          {!scan && (
            <>
              <FormGroup>
                <Field label="Anything worth mentioning?" id="scan-hint" hint="Optional. Bad lighting, a glass that is not yours, half drunk already.">
                  <input
                    id="scan-hint"
                    className="input"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="Taproom lighting is orange"
                    autoCapitalize="sentences"
                    autoComplete="off"
                    enterKeyHint="done"
                  />
                </Field>
              </FormGroup>
              <div className="form-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={run} disabled={busy}>
                  {busy ? <Spinner label="Reading the beer" /> : 'Read this beer'}
                </button>
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => { setPreview(null); setScan(null); }}>
                  Retake
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && <div style={{ marginTop: 14 }}><Banner kind="error">{error}</Banner></div>}

      {scan && (
        <div className="stack" style={{ marginTop: 16 }}>
          <section className="card card-tight">
            <div className="chart-title">What it is</div>
            <div className="scan-facts">
              <ScanFact label="Beer" value={identified?.beerName} />
              <ScanFact label="Brewery" value={identified?.brewery} />
              <ScanFact label="Style" value={identified?.style} />
              <ScanFact
                label="ABV"
                value={
                  scan.abv?.value != null
                    ? `${scan.abv.value}%`
                    : scan.abv?.low != null
                      ? `${scan.abv.low}–${scan.abv.high}% (estimated)`
                      : null
                }
              />
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
              {identified?.readFromLabel ? <CheckIcon size={15} style={{ flex: '0 0 auto', marginTop: 2, color: 'var(--green)' }} /> : <AlertIcon size={15} style={{ flex: '0 0 auto', marginTop: 2, color: 'var(--orange)' }} />}
              <span>
              {identified?.readFromLabel
                ? 'Read off the label.'
                : 'Inferred from appearance, not read off a label — check it.'}
              {identified?.confidence && ` Confidence: ${identified.confidence}.`}
              </span>
            </p>
            {identified?.notes && (
              <p className="secondary" style={{ fontSize: 14, margin: '6px 0 0' }}>{identified.notes}</p>
            )}
          </section>

          <section className="card card-tight">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="chart-title">How it looks</div>
                <div className="chart-sub">This is the one axis a photo can honestly score.</div>
              </div>
              {appearance?.score != null && (
                <span className="score-pill" style={{ '--tone': 'var(--series-1)' }}>
                  {appearance.score}
                  <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>/10</span>
                </span>
              )}
            </div>

            {appearance?.score == null ? (
              <p className="secondary" style={{ fontSize: 14, margin: '10px 0 0' }}>
                No poured beer visible, so there is nothing to score. Photograph the glass to get an
                appearance score.
              </p>
            ) : (
              <>
                <div className="scan-facts" style={{ marginTop: 12 }}>
                  <ScanFact label="Colour" value={appearance.colour} />
                  <ScanFact label="SRM" value={appearance.srm != null ? `~${appearance.srm}` : null} />
                  <ScanFact label="Head" value={appearance.head} />
                  <ScanFact label="Retention" value={appearance.headRetention} />
                </div>

                {appearance.haze != null && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="label">Haziness</span>
                      <span className="tabular" style={{ fontWeight: 700, fontSize: 14 }}>
                        {appearance.clarity}
                      </span>
                    </div>
                    <div className="haze-scale" role="img" aria-label={`Haziness ${appearance.haze} out of 10: ${appearance.clarity}`}>
                      <div className="haze-fill" style={{ width: `${(appearance.haze / 10) * 100}%` }} />
                      <div className="haze-marker" style={{ left: `${(appearance.haze / 10) * 100}%` }} />
                    </div>
                    <div className="haze-ends">
                      <span>brilliant</span>
                      <span>opaque</span>
                    </div>
                    <p className="hint" style={{ marginTop: 6 }}>{CLARITY_HELP[appearance.clarity]}</p>
                  </div>
                )}

                {appearance.reasoning && (
                  <p className="secondary" style={{ fontSize: 14, margin: '12px 0 0', lineHeight: 1.6 }}>
                    {appearance.reasoning}
                  </p>
                )}
              </>
            )}
          </section>

          {scan.flags?.length > 0 && (
            <section className="card card-tight">
              <div className="chart-title">Worth noticing</div>
              <div className="chips" style={{ marginTop: 8 }}>
                {scan.flags.map((f) => (
                  <span className="chip chip-sm" key={f} style={{ boxShadow: 'inset 0 0 0 1.5px var(--warning)' }}><AlertIcon size={14} /> {f}</span>
                ))}
              </div>
            </section>
          )}

          <section className="card card-tight">
            <div className="chart-title">What the style is usually like</div>
            <div className="chart-sub">
              An expectation for the style — not a verdict on this beer. Nobody has tasted it but you.
            </div>
            <p className="secondary" style={{ fontSize: 15, margin: '4px 0 0', lineHeight: 1.6 }}>
              {scan.expectations}
            </p>
          </section>

          {lookup ? (
            <section className="card card-tight">
              <div className="chart-title">What the web says</div>
              <p className="secondary" style={{ fontSize: 15, margin: '8px 0 0', lineHeight: 1.6 }}>
                {lookup.answer}
              </p>
              {lookup.sources?.length > 0 && (
                <ul className="list-reset source-list">
                  {lookup.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            identified?.beerName && (
              <button type="button" className="btn btn-secondary btn-block" onClick={runLookup} disabled={lookingUp}>
                {lookingUp ? <Spinner /> : <><SearchIcon /> Look this beer up on the web</>}
              </button>
            )
          )}

          {scan.caveats && (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>{scan.caveats}</p>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={apply}>
              Use this — then taste it yourself
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => { setPreview(null); setScan(null); setLookup(null); }}>
              Retake
            </button>
          </div>

          <p className="muted" style={{ fontSize: 13, margin: 0, textAlign: 'center' }}>
            Aroma, flavour, mouthfeel and overall are left blank on purpose. A photo cannot taste.
          </p>
        </div>
      )}
    </div>
  );
}

function ScanFact({ label, value }) {
  if (!value) return null;
  return (
    <div className="scan-fact">
      <div className="label">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
