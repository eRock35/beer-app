import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/api.js';
import { useApp } from '../store.jsx';
import { Banner, Empty, usePhone } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { ArrowUpIcon, SparkleIcon } from '../components/icons.jsx';

const SUGGESTIONS = [
  'What should I drink next, based on what I have been logging?',
  'I am in Denver for two nights. Where do I actually go?',
  'My palate is stuck on barrel-aged stouts. Pull me out of it.',
  'What is in my cellar that I should open this month?',
  'Talk me through what separates a great pilsner from a fine one.',
];

const MAX_ROWS = 5;

/**
 * Keeps a fixed composer above the iOS keyboard. The visual viewport shrinks
 * when the keyboard opens; the difference from the layout viewport is how far
 * the composer has to move up.
 */
function useKeyboardInset(enabled) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!enabled || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const update = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(gap > 40 ? gap : 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return inset;
}

export function SommelierView({ go }) {
  const { aiEnabled, user } = useApp();
  const phone = usePhone();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);
  const kb = useKeyboardInset(phone && aiEnabled);

  // Keep the newest message in view. On desktop the log is its own scroller;
  // on a phone the page scrolls, so scroll the window instead.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (log.scrollHeight > log.clientHeight + 4) {
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    } else if (messages.length) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.(), []);

  // Auto-grow the textarea to about five lines, then scroll inside it.
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = 22;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + 18)}px`;
  }, []);
  useEffect(resize, [draft, resize]);

  if (!aiEnabled) {
    return (
      <>
        <PageTitle eyebrow="Ask" title="Sommelier" />
        <Empty
          icon={<SparkleIcon />}
          title="The sommelier is switched off"
          action={
            <button type="button" className="btn btn-secondary" onClick={() => go('journal')}>
              Back to the journal
            </button>
          }
        >
          This deployment has no Claude API key configured. Set <code>ANTHROPIC_API_KEY</code> on the
          server and it turns on — the key stays server-side and is never sent to the browser.
        </Empty>
      </>
    );
  }

  const send = (text) => {
    const content = text.trim();
    if (!content || streaming) return;

    const next = [...messages, { role: 'user', content }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setDraft('');
    setStreaming(true);
    setError('');

    abortRef.current = streamChat(
      { messages: next },
      {
        onDelta: (chunk) =>
          setMessages((current) => {
            const copy = [...current];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          }),
        onError: (message) => {
          setError(message);
          setStreaming(false);
          // Drop the empty assistant bubble so the thread does not look stalled.
          setMessages((current) => {
            const last = current[current.length - 1];
            return last?.role === 'assistant' && !last.content ? current.slice(0, -1) : current;
          });
        },
        onDone: () => setStreaming(false),
      }
    );
  };

  const reset = () => {
    abortRef.current?.();
    setMessages([]);
    setStreaming(false);
    setError('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <div className="chat-page" style={{ maxWidth: 780, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
      <PageTitle
        eyebrow="Ask"
        title="Sommelier"
        action={
          messages.length > 0 && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={reset}>
              New conversation
            </button>
          )
        }
      >
        It can see your journal, your cellar and your wishlist — so ask it things that depend on
        those. Signed in as {user.displayName}.
      </PageTitle>

      <div className="chat">
        <div className="chat-log" ref={logRef} aria-live="polite" aria-atomic="false">
          {messages.length === 0 && (
            <div style={{ padding: '4px 0 8px' }}>
              <p className="secondary" style={{ fontSize: 14, margin: '0 0 8px' }}>Try one of these:</p>
              <div className="prompt-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="chip chip-toggle" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-bot'}`}>
              {m.content ||
                (streaming && i === messages.length - 1 ? (
                  <span className="typing" aria-label="The sommelier is thinking">
                    <span /><span /><span />
                  </span>
                ) : null)}
            </div>
          ))}

          {error && <Banner kind="error">{error}</Banner>}

          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0', textAlign: 'center' }}>
            Taprooms close and recipes get retired — check before you drive somewhere on its word.
          </p>
        </div>

        <div className="chat-spacer" aria-hidden="true" />

        <form
          className="composer"
          style={phone && kb > 0 ? { bottom: kb } : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <textarea
            ref={textareaRef}
            className="textarea"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about a city, a style, or what to open tonight…"
            aria-label="Message the sommelier"
            enterKeyHint="send"
            autoCapitalize="sentences"
            autoComplete="off"
          />
          {streaming ? (
            <button
              type="button"
              className="send-btn is-stop"
              aria-label="Stop"
              onClick={() => {
                abortRef.current?.();
                setStreaming(false);
              }}
            >
              <span style={{ width: 12, height: 12, background: 'currentColor', borderRadius: 2, display: 'block' }} />
            </button>
          ) : (
            <button type="submit" className="send-btn" aria-label="Send" disabled={!draft.trim()}>
              <ArrowUpIcon />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
