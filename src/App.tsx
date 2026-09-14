import React from 'react';
import { AppProvider } from './state/AppContext';
import { href, useRoute } from './ui/router';
import { Dashboard } from './ui/pages/Dashboard';
import { ModulePage } from './ui/pages/ModulePage';
import { SystemsPage } from './ui/pages/SystemsPage';
import { SimulatorPage } from './ui/pages/SimulatorPage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { ConceptsPage } from './ui/pages/ConceptsPage';

const NAV = [
  { path: '/', label: 'Dashboard' },
  { path: '/concepts', label: 'Parloa concepts' },
  { path: '/systems', label: 'Practice systems' },
  { path: '/simulator', label: 'Simulator' },
  { path: '/settings', label: 'Settings & backup' },
];

function Shell() {
  const route = useRoute();
  const section = `/${route.segments[0] ?? ''}`;
  let page: React.ReactNode;
  if (route.segments[0] === 'module' && route.segments[1]) page = <ModulePage moduleId={route.segments[1]} tab={route.segments[2]} />;
  else if (route.segments[0] === 'systems') page = <SystemsPage />;
  else if (route.segments[0] === 'simulator') page = <SimulatorPage />;
  else if (route.segments[0] === 'settings') page = <SettingsPage />;
  else if (route.segments[0] === 'concepts') page = <ConceptsPage />;
  else page = <Dashboard />;
  return (
    <>
      <header className="topbar">
        <a className="brand" href={href('/')}>
          <span className="dot" /> Parloa Integration Trainer
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} className={(n.path === '/' ? section === '/' || section === '/module' : section === n.path) ? 'active' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="spacer" />
        <span className="tiny muted tagline">No account or API key needed · runs entirely in your browser</span>
      </header>
      {page}
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
