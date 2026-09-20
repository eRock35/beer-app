import { useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/api.js';
import { useApp } from '../store.jsx';
import { Banner, Empty, Spinner } from '../components/ui.jsx';

const SUGGESTIONS = [
  'What should I drink next, based on what I have been logging?',
  'I am in Denver for two nights. Where do I actually go?',
  'My palate is stuck on barrel-aged stouts. Pull me out of it.',
  'What is in my cellar that I should open this month?',
  'Talk me through what separates a great pilsner from a fine one.',
];

export function SommelierView({ go }) {
  const { aiEnabled, user } = useApp();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.(), []);

  if (!aiEnabled) {
    return (
      <Empty
        icon="🎩"
        title="The sommelier is switched off"
        action={
          <button type="button" className="btn" onClick={() => go('journal')}>
            Back to the journal
          </button>
        }
      >
        This deployment has no Claude API key configured. Set <code>ANTHROPIC_API_KEY</code> on the
        server and it turns on — the key stays server-side and is never sent to the browser.
      </Empty>
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

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Sommelier</h1>
          <p>
            It can see your journal, your cellar and your wishlist — so ask it things that depend on
            those. Signed in as {user.displayName}.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              abortRef.current?.();
              setMessages([]);
              setStreaming(false);
              setError('');
            }}
          >
            New conversation
          </button>
        )}
      </div>

      <div className="card chat">
        {messages.length === 0 && (
          <div style={{ padding: '8px 0 16px' }}>
            <p className="secondary" style={{ fontSize: '0.9rem' }}>Try one of these:</p>
            <div className="prompt-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip chip-toggle" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-log" ref={logRef} aria-live="polite" aria-atomic="false">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-bot'}`}>
              {m.content || (streaming && i === messages.length - 1 ? <Spinner label="Thinking" /> : null)}
            </div>
          ))}
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about a city, a style, or what to open tonight…"
            disabled={streaming}
            aria-label="Message the sommelier"
          />
          {streaming ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                abortRef.current?.();
                setStreaming(false);
              }}
            >
              Stop
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              Send
            </button>
          )}
        </form>
      </div>

      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 12, textAlign: 'center' }}>
        Taprooms close and recipes get retired — check before you drive somewhere on its word.
      </p>
    </div>
  );
}
