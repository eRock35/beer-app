import { useEffect, useState } from 'react';
import { useApp } from './store.jsx';
import { Spinner } from './components/ui.jsx';
import { MapView } from './views/MapView.jsx';
import { JournalView } from './views/JournalView.jsx';
import { PassportView } from './views/PassportView.jsx';
import { TripsView } from './views/TripsView.jsx';
import { CellarView } from './views/CellarView.jsx';
import { FeedView } from './views/FeedView.jsx';
import { SommelierView } from './views/SommelierView.jsx';
import { DispatchView } from './views/DispatchView.jsx';
import { AccountView } from './views/AccountView.jsx';
import { AuthGate } from './views/AuthGate.jsx';

const TABS = [
  { id: 'map', label: 'Find', icon: '📍', view: MapView, public: true },
  { id: 'journal', label: 'Journal', icon: '📓', view: JournalView },
  { id: 'passport', label: 'Passport', icon: '🛂', view: PassportView },
  { id: 'trips', label: 'Trips', icon: '✈️', view: TripsView },
  { id: 'cellar', label: 'Cellar', icon: '🛢️', view: CellarView },
  { id: 'feed', label: 'Feed', icon: '🍻', view: FeedView, public: true },
  { id: 'dispatch', label: 'Dispatch', icon: '📡', view: DispatchView },
  { id: 'sommelier', label: 'Sommelier', icon: '🎩', view: SommelierView },
  { id: 'account', label: 'Account', icon: '⚙️', view: AccountView, hidden: true },
];

/** Hash routing — no router dependency, and deep links still work. */
function useHashRoute(fallback = 'map') {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || fallback);
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || fallback);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [fallback]);
  const go = (id) => {
    window.location.hash = id;
    setRoute(id);
  };
  return [route, go];
}

export function App() {
  const { user, booting, theme, setTheme, logout } = useApp();
  const [route, go] = useHashRoute();
  const tab = TABS.find((t) => t.id === route) || TABS[0];

  useEffect(() => {
    document.title =
      tab.id === 'map' ? 'Hopscotch — Craft Beer Passport' : `${tab.label} · Hopscotch`;
  }, [tab]);

  if (booting) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', gap: 12 }}>
        <span style={{ fontSize: '2.4rem' }} aria-hidden="true">🍺</span>
        <Spinner label="Starting Hopscotch" />
      </div>
    );
  }

  const View = tab.view;
  const needsAuth = !tab.public && !user;

  const cycleTheme = () => {
    const order = ['system', 'light', 'dark'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#map"
          onClick={(e) => {
            e.preventDefault();
            go('map');
          }}
        >
          <span className="brand-mark" aria-hidden="true">🍺</span>
          Hopscotch
          <span className="brand-sub">Beer Passport</span>
        </a>

        <nav className="nav" aria-label="Sections">
          {TABS.filter((t) => !t.hidden).map((t) => (
            <button
              key={t.id}
              type="button"
              className="nav-item"
              aria-current={t.id === tab.id ? 'page' : undefined}
              onClick={() => go(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="topbar-spacer" />

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
          aria-label={`Theme: ${theme}. Click to change.`}
        >
          {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌗'}
        </button>

        {user ? (
          <button type="button" className="btn btn-sm" onClick={() => go('account')}>
            {user.displayName}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go('journal')}>
            Sign in
          </button>
        )}
      </header>

      <main className={`main${tab.id === 'map' ? ' is-map' : ''}`}>
        {needsAuth ? <AuthGate feature={tab.label} /> : <View go={go} onLogout={logout} />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.filter((t) => !t.hidden).map((t) => (
          <button
            key={t.id}
            type="button"
            className="nav-item"
            aria-current={t.id === tab.id ? 'page' : undefined}
            onClick={() => go(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
