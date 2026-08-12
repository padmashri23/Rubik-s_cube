import { useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './state/store';
import LandingPage from './pages/LandingPage';
import ScannerPage from './pages/ScannerPage';
import SolvePage from './pages/SolvePage';
import LearnPage from './pages/LearnPage';
import DashboardPage from './pages/DashboardPage';
import SettingsButton from './components/SettingsButton';
import ErrorBoundary from './components/ErrorBoundary';
/** Sync accessibility settings to <html data-*> so global.css can react. */
function useApplySettings() {
  const { largeText, reducedMotion } = useStore((s) => s.settings);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.largeText = String(largeText);
    el.dataset.reducedMotion = String(reducedMotion);
  }, [largeText, reducedMotion]);
}

const NAV = [
  { to: '/scan', label: 'Scan' },
  { to: '/solve', label: 'Solve' },
  { to: '/learn', label: 'Learn' },
  { to: '/dashboard', label: 'Progress' },
];

function Header() {
  return (
    <header className="app-header">
      <div className="container app-header__inner">
        <NavLink to="/" className="brand" aria-label="CubeGuide AI home">
          <span className="brand__mark" aria-hidden />
          <span className="brand__text">
            CubeGuide<span className="brand__ai"> AI</span>
          </span>
        </NavLink>
        <nav className="app-nav" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => 'app-nav__link' + (isActive ? ' is-active' : '')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <SettingsButton />
      </div>
    </header>
  );
}

export default function App() {
  useApplySettings();
  const location = useLocation();

  return (
    <div className="app-shell">
      <Header />
      <main id="main" className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <ErrorBoundary key={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/scan" element={<ScannerPage />} />
              <Route path="/solve" element={<SolvePage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="*" element={<LandingPage />} />
            </Routes>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
