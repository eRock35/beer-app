import { useState } from 'react';
import { api } from '../lib/api.js';
import { Confirm, useToast } from './ui.jsx';
import { ArrowUpRightIcon, SignpostIcon, TicketIcon } from './icons.jsx';

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

/**
 * The links you have handed out - passport cards and crawls - each with a
 * way to take it back. Deleting kills the page and its picture at once; a
 * preview a chat app already fetched is that app's copy, and the confirm
 * says so rather than promising what the server cannot do.
 *
 * `state` is a useAsync over api.shares(); the parent reloads it after a new
 * share is made.
 */
export function SharedLinks({ state }) {
  const toast = useToast();
  const [gone, setGone] = useState(() => new Set());
  if (state.loading || state.error || !state.data) return null;

  const rows = [
    ...state.data.passports.map((s) => ({
      kind: 'passport',
      id: s.id,
      url: s.url,
      icon: <TicketIcon />,
      title: 'Passport card',
      detail: `${s.beers} ${s.beers === 1 ? 'beer' : 'beers'}, ${s.badges} ${s.badges === 1 ? 'badge' : 'badges'}`,
      createdAt: s.createdAt,
    })),
    ...state.data.crawls.map((s) => ({
      kind: 'crawl',
      id: s.id,
      url: s.url,
      icon: <SignpostIcon />,
      title: s.title || 'A crawl',
      detail: `Crawl · ${s.stops} ${s.stops === 1 ? 'stop' : 'stops'}`,
      createdAt: s.createdAt,
    })),
  ]
    .filter((r) => !gone.has(`${r.kind}:${r.id}`))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  if (!rows.length) return null;

  const remove = async (row) => {
    try {
      await api.deleteShare(row.kind, row.id);
      setGone((g) => new Set(g).add(`${row.kind}:${row.id}`));
      toast('Link deleted', { kind: 'success' });
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };

  return (
    <section className="card">
      <h3 className="card-title" style={{ marginBottom: 2 }}>Your shared links</h3>
      <p className="secondary" style={{ margin: 0, fontSize: 14 }}>
        Anyone with one of these links can open it. Delete one and it stops working.
      </p>
      <ul className="list-reset shared-links">
        {rows.map((row) => (
          <li key={`${row.kind}:${row.id}`} className="shared-link">
            <span className="shared-link-icon" aria-hidden="true">{row.icon}</span>
            <span className="shared-link-text">
              <span className="shared-link-title truncate">{row.title}</span>
              <span className="shared-link-meta">
                {row.detail} · shared {shortDate(row.createdAt)}
              </span>
            </span>
            <span className="shared-link-actions">
              <a className="btn btn-sm btn-secondary" href={row.url} target="_blank" rel="noopener" aria-label={`Open ${row.title}`}>
                <ArrowUpRightIcon /> Open
              </a>
              <Confirm
                onConfirm={() => remove(row)}
                title="Delete this link?"
                message="The page and its picture stop working for everyone. A preview a chat app has already shown stays in that chat."
              >
                Delete
              </Confirm>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
