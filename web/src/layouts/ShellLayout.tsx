import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Package,
  Pill,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { HealthResponse } from '../types/api';

const BRANCH_NAME =
  (import.meta.env.VITE_BRANCH_NAME as string | undefined) ||
  'YCDO Central Hospital';
const BRANCH_CODE =
  (import.meta.env.VITE_BRANCH_CODE as string | undefined) || 'CH';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function formatPkt(d: Date): string {
  return d.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const NAV = [
  { to: '/registration', label: 'Registration', icon: UserPlus },
  { to: '/dispense', label: 'Dispense', icon: Pill },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/stock', label: 'Stock', icon: Package },
] as const;

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/registration': {
    title: 'Registration',
    subtitle: 'Issue registration token',
  },
  '/dispense': {
    title: 'Dispense',
    subtitle: 'Pharmacy counter',
  },
  '/patients': {
    title: 'Patients',
    subtitle: 'Search & register',
  },
  '/stock': {
    title: 'Stock',
    subtitle: 'On-hand & ledger',
  },
};

export function ShellLayout() {
  const clock = useClock();
  const location = useLocation();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<HealthResponse>('/health'),
    refetchInterval: 10_000,
    retry: false,
  });

  const online = health.isSuccess && health.data?.ok === true;
  const page = PAGE_META[location.pathname] ?? {
    title: 'HMS',
    subtitle: '',
  };

  return (
    <div className="flex h-svh overflow-hidden bg-canvas text-slate-600">
      <aside className="flex w-64 shrink-0 flex-col bg-navy text-white">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-navy-light text-sm font-bold tracking-wide">
            YCDO
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight">HMS</div>
            <div className="text-xs text-white/60">Hospital counter</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-navy-light text-white'
                    : 'text-white/75 hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              <Icon className="size-5 shrink-0 opacity-90" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-3 text-sm">
          <div className="font-semibold text-white">Counter</div>
          <div className="mt-0.5 truncate text-white/70">
            {BRANCH_NAME}
            <span className="ml-1 font-mono text-white/50">· {BRANCH_CODE}</span>
          </div>
          <div
            className="mt-2 flex items-center gap-2"
            title={
              online
                ? `API ok @ ${health.data?.at ?? ''}`
                : health.error
                  ? String((health.error as Error).message)
                  : 'Checking…'
            }
          >
            <span
              className={[
                'inline-block size-2.5 rounded-full',
                online ? 'bg-emerald-400' : 'bg-red-500',
              ].join(' ')}
              aria-hidden
            />
            <span className={online ? 'text-emerald-300' : 'text-red-300'}>
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" strokeWidth={2} />
            <div>
              <h1 className="text-base font-semibold text-slate-800">
                {page.title}
              </h1>
              {page.subtitle && (
                <p className="text-xs text-slate-400">{page.subtitle}</p>
              )}
            </div>
          </div>
          <div className="font-mono text-sm tabular-nums text-slate-500">
            {formatPkt(clock)}
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
