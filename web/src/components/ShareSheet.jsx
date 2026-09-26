import { useEffect, useState } from 'react';
import { Banner, Sheet, Spinner, useMedia, useToast } from './ui.jsx';
import { ArrowUpRightIcon, ShareIcon } from './icons.jsx';

/**
 * Makes a share link, SHOWS the card, and shares on a second tap.
 *
 * Two taps on purpose. iOS only opens a share sheet inside a fresh user
 * gesture, and minting the link plus fetching the picture takes two round
 * trips - by the time they land, the first tap's activation is spent and
 * navigator.share() is refused. So the first tap makes and previews the card
 * (which is worth seeing anyway), and the Share button is the fresh gesture.
 *
 * On a phone, Share hands over the PNG itself where the browser can share
 * files (Messages, Instagram take a picture better than a link), else the
 * link. On a desktop it copies the link - a desktop share sheet is rarely
 * where anyone wants to paste a beer passport.
 */
export function ShareSheet({ open, onClose, create, title = 'Share your passport', fileName = 'hopscotch-passport.png' }) {
  const toast = useToast();
  const coarse = useMedia('(pointer: coarse)');
  const [share, setShare] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setShare(null);
    setFile(null);
    setError('');
    setLoaded(false);
    (async () => {
      try {
        const made = await create();
        if (cancelled) return;
        setShare(made);
        // Fetch the picture now, so the Share tap has the file in hand and
        // spends its gesture on the share sheet rather than on a download.
        const res = await fetch(made.png);
        if (!res.ok) return;
        const blob = await res.blob();
        if (!cancelled) setFile(new File([blob], fileName, { type: 'image/png' }));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, create, fileName]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      toast('Link copied', { kind: 'success' });
    } catch {
      toast('Copy the link from the box below', { kind: 'info' });
    }
  };

  const shareIt = async () => {
    if (!share) return;
    if (!coarse || !navigator.share) return copy();
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, url: share.url });
      } else {
        await navigator.share({ title, url: share.url });
      }
    } catch (err) {
      // Dismissing the share sheet is not an error worth a toast.
      if (err?.name !== 'AbortError') copy();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="A snapshot of today’s numbers" width={640}>
      {error ? (
        <Banner kind="error">{error}</Banner>
      ) : (
        <div className="stack">
          <div className="share-preview">
            {share ? (
              <img
                src={share.png}
                alt="Your passport card"
                width="1200"
                height="630"
                onLoad={() => setLoaded(true)}
                style={{ opacity: loaded ? 1 : 0 }}
              />
            ) : null}
            {!loaded && (
              <span className="share-preview-wait">
                <Spinner label="Drawing your card" />
              </span>
            )}
          </div>

          <p className="secondary" style={{ margin: 0, fontSize: 14 }}>
            Anyone with the link sees this card: your first name, your counts and your top public
            beer. Never your email, and nothing you marked private.
          </p>

          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={shareIt} disabled={!share}>
            <ShareIcon /> {coarse ? 'Share' : 'Copy link'}
          </button>

          {share && (
            <>
              <input
                className="input"
                readOnly
                value={share.url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
              />
              <a className="btn btn-secondary btn-block" href={share.url} target="_blank" rel="noopener">
                <ArrowUpRightIcon /> Open the page
              </a>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
