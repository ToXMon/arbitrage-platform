/**
 * @arbitrage/frontend - Main App Component
 */

import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Dashboard } from './pages/Dashboard';
import { Opportunities } from './pages/Opportunities';
import { Trades } from './pages/Trades';
import { Bots } from './pages/Bots';
import { Settings } from './pages/Settings';
import { useWebSocket } from './hooks/useWebSocket';

import './App.css';

function App() {
  // Fetch health status
  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Connect to WebSocket for real-time updates
  const { isConnected } = useWebSocket('/ws');

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <h1>⚡ Arbitrage Platform</h1>
        </div>
        <nav className="nav">
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/opportunities" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Opportunities
          </NavLink>
          <NavLink to="/trades" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Trades
          </NavLink>
          <NavLink to="/bots" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Bots
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Settings
          </NavLink>
        </nav>
        <div className="status">
          <span className={`ws-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢' : '🔴'} {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {isError && <span className="api-error">⚠️ API Error</span>}
        </div>
      </header>
      
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      
      <footer className="app-footer">
        <span>Arbitrage Platform v1.0.0</span>
        {health && <span>Uptime: {Math.floor(health.uptime / 60)}m</span>}
      </footer>
    </div>
  );
}

export default App;
