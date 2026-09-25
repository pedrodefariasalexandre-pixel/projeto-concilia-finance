import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { ProtectedOutletContext } from './ProtectedRoute';
import './AppLayout.css';

const NAV_LINKS = [
  { to: '/', label: 'Início', end: true },
  { to: '/pessoas', label: 'Pessoas' },
  { to: '/categorias', label: 'Categorias' },
  { to: '/contas', label: 'Contas' },
  { to: '/cobrancas-fixas', label: 'Cobranças fixas' },
];

export function AppLayout() {
  const context = useOutletContext<ProtectedOutletContext>();

  return (
    <div className="app-shell">
      <header className="app-nav">
        <nav>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="logout" onClick={() => void supabase.auth.signOut()}>
          Sair
        </button>
      </header>
      <main>
        <Outlet context={context} />
      </main>
    </div>
  );
}
