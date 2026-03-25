'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building2,
  AlertCircle,
  Search,
  Activity,
  Zap,
  LayoutDashboard,
} from 'lucide-react';

const navItems = [
  { href: '/enterprises', label: 'Enterprises', icon: Building2, description: 'All enterprise health' },
  { href: '/jobs', label: 'Failed Jobs', icon: AlertCircle, description: 'Failed delivery jobs' },
  { href: '/trace', label: 'Invoice Trace', icon: Search, description: 'End-to-end lookup' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-white border-r border-gray-200 flex flex-col z-30">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">GIP Insight</p>
            <p className="text-xs text-gray-500">Sync Dashboard</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group',
                active
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
              )}
            >
              <item.icon
                className={cn('w-4 h-4 flex-shrink-0', active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600')}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex items-center gap-2 px-3 py-2">
          <Activity className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs text-gray-500">Production</span>
        </div>
      </div>
    </aside>
  );
}
