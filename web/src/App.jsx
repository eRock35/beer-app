import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { FeedbackProvider, Group, Row, Segmented, Sheet, Spinner } from './components/ui.jsx';
import { HeaderContext } from './components/header.jsx';
import {
  AntennaIcon,
  BarrelIcon,
  BookIcon,
  BubblesIcon,
  CircleHalfIcon,
  EllipsisCircleIcon,
  GlassIcon,
  MapPinIcon,
  MoonIcon,
  PersonIcon,
  SignOutIcon,
  SignpostIcon,
  SparkleIcon,
  SunIcon,
  TicketIcon,
} from './components/icons.jsx';
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
  { id: 'map', label: 'Find', Icon: MapPinIcon, view: MapView, public: true },
  { id: 'journal', label: 'Journal', Icon: BookIcon, view: JournalView },
  { id: 'passport', label: 'Passport', Icon: TicketIcon, view: PassportView },
  { id: 'trips', label: 'Trips', Icon: SignpostIcon, view: TripsView },
  { id: 'cellar', label: 'Cellar', Icon: BarrelIcon, view: CellarView, more: true },
  { id: 'feed', label: 'Feed', Icon: BubblesIcon, view: FeedView, public: true, more: true },
  { id: 'dispatch', label: 'Dispatch', Icon: AntennaIcon, view: DispatchView, more: true },
  { id: 'sommelier', label: 'Sommelier', Icon: SparkleIcon, view: SommelierView, more: true },
  { id: 'account', label: 'Account', Icon: PersonIcon, view: AccountView, hidden: true, more: true },
];

const PRIMARY = TABS.filter((t) => !t.more && !t.hidden);
const MORE = TABS.filter((t) => t.more);

/** Hash routing — no router dependency, and deep links still work. */
function useHashRoute(fallback = 'map') {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || fallback);
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || fallback);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [fallback]);
  const go = useCallback((id) => {
    window.location.hash = id;
    setRoute(id);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}

const THEME_OPTIONS = [
  { value: 'system', label: 'Auto', icon: <CircleHalfIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

export function App() {
  return (
    <FeedbackProvider>
      <Shell />
    </FeedbackProvider>
  );
}

function Shell() {
  const { user, booting, theme, setTheme, logout } = useApp();
  const [route, go] = useHashRoute();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const tab = TABS.find((t) => t.id === route) || TABS[0];
  const headerValue = useMemo(() => ({ setCollapsed }), []);

  useEffect(() => {
    document.title =
      tab.id === 'map' ? 'Hopscotch — Craft Beer Passport' : `${tab.label} · Hopscotch`;
  }, [tab]);

  useEffect(() => {
    setMoreOpen(false);
  }, [route]);

  if (booting) {
    return (
      <div className="splash">
        <GlassIcon className="splash-mark" strokeWidth={1.5} />
        <Spinner label="Starting Hopscotch" />
      </div>
    );
  }

  const View = tab.view;
  const needsAuth = !tab.public && !user;
  const isMap = tab.id === 'map';
  const isChat = tab.id === 'sommelier' && user;
  const moreActive = tab.more || tab.hidden;

  const cycleTheme = () => {
    const order = ['system', 'light', 'dark'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  return (
    <HeaderContext.Provider value={headerValue}>
      <div className="app">
        {/* Desktop top bar */}
        <header className="topbar">
          <a
            className="brand"
            href="#map"
            onClick={(e) => {
              e.preventDefault();
              go('map');
            }}
          >
            <GlassIcon className="brand-mark" />
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
                <t.Icon />
                <span className="nav-label">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="topbar-spacer" />

          <button
            type="button"
            className="icon-btn"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            aria-label={`Theme: ${theme}. Click to change.`}
          >
            {theme === 'dark' ? <MoonIcon size={22} /> : theme === 'light' ? <SunIcon size={22} /> : <CircleHalfIcon size={22} />}
          </button>

          {user ? (
            <button
              type="button"
              className="btn btn-sm btn-neutral"
              aria-current={tab.id === 'account' ? 'page' : undefined}
              onClick={() => go('account')}
            >
              <PersonIcon />
              {user.displayName}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => go('journal')}>
              Sign in
            </button>
          )}
        </header>

        {/* Phone compact header */}
        <div className={`compact-header${isMap || collapsed ? ' is-visible' : ''}`} aria-hidden={!(isMap || collapsed)}>
          <span className="compact-title">
            {isMap ? (
              <>
                <GlassIcon className="brand-mark" />
                Hopscotch
              </>
            ) : (
              tab.label
            )}
          </span>
        </div>

        <main className={`main${isMap ? ' is-map' : ''}${isChat ? ' is-chat' : ''}`}>
          {needsAuth ? <AuthGate feature={tab.label} /> : <View go={go} onLogout={logout} />}
        </main>

        {/* Phone tab bar */}
        <nav className="tabbar" aria-label="Sections">
          {PRIMARY.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab-item"
              aria-current={t.id === tab.id ? 'page' : undefined}
              onClick={() => go(t.id)}
            >
              <t.Icon />
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className={`tab-item${moreActive ? ' is-active' : ''}`}
            aria-current={moreActive ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <EllipsisCircleIcon />
            More
          </button>
        </nav>

        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" width={420}>
          <Group>
            {MORE.map((t) => (
              <Row
                key={t.id}
                icon={<t.Icon />}
                title={t.label}
                subtitle={t.id === 'account' && user ? user.displayName : undefined}
                onClick={() => go(t.id)}
                aria-current={t.id === tab.id ? 'page' : undefined}
              />
            ))}
          </Group>

          <Group title="Appearance">
            <Row
              icon={theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <CircleHalfIcon />}
              title="Theme"
              trailing={<Segmented value={theme} onChange={setTheme} options={THEME_OPTIONS} label="Theme" />}
            />
          </Group>

          <Group>
            {user ? (
              <Row
                icon={<SignOutIcon />}
                title="Sign out"
                subtitle={user.email}
                destructive
                chevron={false}
                onClick={async () => {
                  await logout();
                  setMoreOpen(false);
                  go('map');
                }}
              />
            ) : (
              <Row icon={<PersonIcon />} title="Sign in or create an account" onClick={() => go('journal')} />
            )}
          </Group>
        </Sheet>
      </div>
    </HeaderContext.Provider>
  );
}
