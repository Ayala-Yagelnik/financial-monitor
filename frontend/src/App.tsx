// App.tsx
// Definition of routing and general layout of the application

import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import AddTransaction from './pages/AddTransaction';
import Monitor from './pages/Monitor';

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.app}>
        {/* Navigation bar */}
        <nav style={styles.nav}>
          <div style={styles.navBrand}>
            <span style={styles.brandIcon}>₿</span>
            <span style={styles.brandName}>FinMonitor</span>
          </div>

          <div style={styles.navLinks}>
            {/* NavLink automatically adds class="active" to current route */}
            <NavLink
              to="/add"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              ➕ Simulator
            </NavLink>

            <NavLink
              to="/monitor"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              📡 Live Monitor
            </NavLink>
          </div>
        </nav>

        {/* Main content */}
        <main style={styles.main}>
          <Routes>
            {/* Redirect from root to /add */}
            <Route path="/" element={<Navigate to="/add" replace />} />
            <Route path="/add" element={<AddTransaction />} />
            <Route path="/monitor" element={<Monitor />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    color: '#f1f5f9',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2rem',
    height: 64,
    background: 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  brandIcon: { fontSize: '1.5rem' },
  brandName: { fontWeight: 700, fontSize: '1.1rem', color: '#e2e8f0' },
  navLinks: { display: 'flex', gap: '0.5rem' },
  navLink: {
    padding: '0.5rem 1.2rem',
    borderRadius: 8,
    color: '#94a3b8',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: '0.9rem',
    transition: 'all 0.2s',
  },
  navLinkActive: {
    background: 'rgba(59,130,246,0.15)',
    color: '#93c5fd',
  },
  main: { padding: '1rem 0' },
};
