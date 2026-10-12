import type { ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canReadAudit, canSeeCatalog } from '../lib/permissions';
import { LoadingState } from './ui';

type IconName = 'grid' | 'spark' | 'book' | 'boxes' | 'trend' | 'refresh' | 'file' | 'tag' | 'cart' | 'truck' | 'shield' | 'settings';

const groups: Array<{
  label: string;
  links: Array<{ to: string; label: string; icon: IconName; catalog?: boolean; audit?: boolean }>;
}> = [
  {
    label: 'Plan',
    links: [
      { to: '/dashboard', label: 'Command center', icon: 'grid' },
      { to: '/assistant', label: 'Assistant', icon: 'spark' },
      { to: '/guide', label: 'Operating guide', icon: 'book' },
    ],
  },
  {
    label: 'Decide',
    links: [
      { to: '/inventory', label: 'Inventory', icon: 'boxes' },
      { to: '/forecasts', label: 'Forecasts', icon: 'trend' },
      { to: '/replenishment', label: 'Replenishment', icon: 'refresh' },
      { to: '/purchase-orders', label: 'Purchase orders', icon: 'file' },
    ],
  },
  {
    label: 'Master data',
    links: [
      { to: '/products', label: 'Products', icon: 'tag', catalog: true },
      { to: '/sales', label: 'Sales', icon: 'cart' },
      { to: '/suppliers', label: 'Suppliers', icon: 'truck', catalog: true },
      { to: '/audit', label: 'Audit', icon: 'shield', audit: true },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const crumbs: Array<{ prefix: string; label: string }> = [
  { prefix: '/dashboard', label: 'Command center' },
  { prefix: '/assistant', label: 'Assistant' },
  { prefix: '/guide', label: 'Operating guide' },
  { prefix: '/inventory', label: 'Inventory' },
  { prefix: '/forecasts', label: 'Forecasts' },
  { prefix: '/replenishment', label: 'Replenishment' },
  { prefix: '/purchase-orders', label: 'Purchase orders' },
  { prefix: '/products', label: 'Products' },
  { prefix: '/sales', label: 'Sales' },
  { prefix: '/suppliers', label: 'Suppliers' },
  { prefix: '/audit', label: 'Audit' },
  { prefix: '/settings', label: 'Settings' },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3.5 13.8 9 19.5 10.5 13.8 12.2 12 17.5 10.2 12.2 4.5 10.5 10.2 9Z" />
        <path d="M18 15.5 18.7 17.3 20.5 18 18.7 18.7 18 20.5 17.3 18.7 15.5 18 17.3 17.3Z" />
      </>
    ),
    book: (
      <>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5Z" />
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    boxes: (
      <>
        <path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z" />
        <path d="M12 12.5 20 8M12 12.5 4 8M12 12.5V20.5" />
      </>
    ),
    trend: (
      <>
        <path d="M4 16.5 9.5 11l3.5 3.5L20 7.5" />
        <path d="M14.5 7.5H20V13" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 12a8 8 0 1 1-2.3-5.6" />
        <path d="M20 4.5V9h-4.5" />
      </>
    ),
    file: (
      <>
        <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
        <path d="M14 3.5V9h5.5" />
      </>
    ),
    tag: (
      <>
        <path d="M4.5 12.5 12 5h7.5v7.5L12 20Z" />
        <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    cart: (
      <>
        <path d="M4 5.5h2.2l1.6 9.2a1.5 1.5 0 0 0 1.5 1.3H17" />
        <path d="M8.2 8.5h12l-1.4 5.5H9.4" />
        <circle cx="10" cy="19" r="1.2" />
        <circle cx="17" cy="19" r="1.2" />
      </>
    ),
    truck: (
      <>
        <path d="M3.5 7.5h11v8h-11Z" />
        <path d="M14.5 11h4l2 2.5v2h-6" />
        <circle cx="7.5" cy="17.5" r="1.4" />
        <circle cx="17.5" cy="17.5" r="1.4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3.5 19 6.5v5.2c0 4.2-2.8 7.2-7 8.8-4.2-1.6-7-4.6-7-8.8V6.5Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.8v2.2M12 18v2.2M4.8 7.2l1.9 1.1M17.3 15.7l1.9 1.1M4.8 16.8l1.9-1.1M17.3 8.3l1.9-1.1" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Mark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-copper text-[13px] font-bold tracking-tight text-white shadow-sm">
      Iv
    </span>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase().replaceAll('_', ' ');
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="px-8 py-8">
        <LoadingState label="Checking your session" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!user) {
    return null;
  }
  const visible = groups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => {
        if (link.catalog && !canSeeCatalog(user.role)) return false;
        if (link.audit && !canReadAudit(user.role)) return false;
        return true;
      }),
    }))
    .filter((group) => group.links.length > 0);
  const current = crumbs.find((crumb) => pathname === crumb.prefix || pathname.startsWith(`${crumb.prefix}/`));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-30 hidden h-screen flex-col bg-ink text-stone-300 lg:flex">
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          <Mark />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-tight text-white">Invorra</p>
            <p className="text-[11px] text-stone-400">Inventory intelligence</p>
          </div>
        </div>
        <div className="mx-3 mb-4 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Workspace</p>
          <p className="mt-0.5 truncate text-sm font-medium text-white">{user.organization.name}</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {visible.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{group.label}</p>
              <div className="mt-1.5 space-y-0.5">
                {group.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                        isActive
                          ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#b4532a]'
                          : 'text-stone-300 hover:bg-white/[0.06] hover:text-white'
                      }`
                    }
                  >
                    <Icon name={link.icon} />
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-[11px] text-stone-400">{roleLabel(user.role)}</p>
            </div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-semibold text-stone-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="border-b border-white/10 bg-ink text-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Mark />
              <div>
                <p className="text-sm font-semibold">Invorra</p>
                <p className="text-[11px] text-stone-400">{user.organization.name}</p>
              </div>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-stone-300"
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
            >
              Log out
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {visible.flatMap((group) => group.links).map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    isActive ? 'bg-white/15 text-white' : 'text-stone-300'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/90 px-5 backdrop-blur lg:px-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">Workspace</p>
            <p className="truncate text-sm font-semibold text-ink">{current?.label ?? 'Invorra'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
            <span className="rounded-full border border-line bg-mist px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              {roleLabel(user.role)}
            </span>
          </div>
        </header>
        <main className="px-5 py-6 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
