'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';

const STORAGE_KEY = 'gip-sidebar-collapsed';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // Start expanded to avoid layout shift; sync from localStorage after mount
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {}
    setMounted(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      {/* Margin transitions in sync with the sidebar width transition */}
      <div
        className={[
          'flex-1 flex flex-col min-w-0 transition-[margin] duration-200',
          mounted ? (collapsed ? 'ml-14' : 'ml-60') : 'ml-60',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
