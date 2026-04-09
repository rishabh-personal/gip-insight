'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building2, AlertCircle, Search, Activity, Zap,
  ChevronLeft, ChevronRight, BookMarked, LogOut,
} from 'lucide-react';

function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  };
}

const navItems = [
  { href: '/enterprises',      label: 'Enterprises',      icon: Building2,   description: 'All enterprise health'       },
  { href: '/jobs',             label: 'Failed Jobs',       icon: AlertCircle, description: 'Failed delivery jobs'        },
  { href: '/trace',            label: 'Invoice Trace',     icon: Search,      description: 'End-to-end lookup'           },
  { href: '/failure-analysis', label: 'Failure Analysis',  icon: BookMarked,  description: 'Root cause & pattern tracking' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ── Desktop sidebar (hidden on mobile) ───────────────────────────────────────

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const logout   = useLogout();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 bg-white border-r border-gray-200 flex flex-col z-30',
        'transition-[width] duration-200 overflow-hidden',
        /* Hide entirely on small screens; show on md+ */
        'hidden md:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* Logo + toggle */}
      <div className="h-16 flex items-center border-b border-gray-200 flex-shrink-0 px-3 gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className={cn('flex-1 min-w-0 transition-opacity duration-150', collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
          <p className="text-sm font-semibold text-gray-900 truncate">GIP Insight</p>
          <p className="text-xs text-gray-500 truncate">Sync Dashboard</p>
        </div>
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm transition-colors group',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
              )}
            >
              <item.icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600')} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-gray-200 space-y-0.5">
        <div
          className={cn('flex items-center rounded-lg px-3 py-2', collapsed ? 'justify-center px-0' : 'gap-2')}
          title={collapsed ? 'Production' : undefined}
        >
          <Activity className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {!collapsed && <span className="text-xs text-gray-500">Production</span>}
        </div>
        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center rounded-lg text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors py-2',
            collapsed ? 'justify-center px-0' : 'gap-2 px-3',
          )}
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}

// ── Mobile bottom nav (shown only on small screens) ───────────────────────────

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40 flex md:hidden">
      {navItems.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
              active ? 'text-indigo-600' : 'text-gray-400',
            )}
          >
            <item.icon className={cn('w-5 h-5', active ? 'text-indigo-600' : 'text-gray-400')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
