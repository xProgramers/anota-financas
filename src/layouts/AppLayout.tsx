import { BarChart3, List, LogOut, MessageSquareText, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../features/auth/AuthProvider';

const NAV = [
  { to: '/', label: 'Anotar', icon: MessageSquareText, end: true },
  { to: '/resumo', label: 'Resumo', icon: BarChart3 },
  { to: '/transacoes', label: 'Transações', icon: List },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

function initials(name: string | null | undefined, email: string | undefined) {
  const base = (name || email || '?').trim();
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function AppLayout() {
  const { profile, session, signOut } = useAuth();
  const display = profile?.name || session?.user.email || '';

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* Barra lateral (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <Logo className="px-5 pt-6 pb-8" />
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] transition ${
                  isActive ? 'bg-brand-soft font-semibold text-brand' : 'text-muted hover:bg-ink/5 hover:text-ink'
                }`
              }
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-line px-4 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand" aria-hidden>
            {initials(profile?.name, session?.user.email)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={display}>
            {display}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md p-2 text-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Cabeçalho (celular) */}
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-3 py-2 md:hidden">
        <Logo compact className="pl-1" />
        <nav className="flex gap-1" aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                `flex size-10 items-center justify-center rounded-lg transition ${isActive ? 'bg-brand-soft text-brand' : 'text-muted'}`
              }
            >
              <Icon className="size-5" aria-hidden />
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
