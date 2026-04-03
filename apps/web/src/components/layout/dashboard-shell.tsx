'use client';

import { useState, useEffect } from 'react';
import { Sidebar, MobileBottomNav } from './sidebar';

const STORAGE_KEY = 'gip-sidebar-collapsed';

export function DashboardShell({ children }: { children: React.ReactNode }) {
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
      {/* Desktop sidebar */}
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      {/*
        Content area:
        - Mobile (< md): full width, pb-16 for bottom nav clearance
        - Desktop: margin matches sidebar width, transitions in sync
      */}
      <div
        className={[
          'flex-1 flex flex-col min-w-0 pb-16 md:pb-0',
          'md:transition-[margin] md:duration-200',
          mounted ? (collapsed ? 'md:ml-14' : 'md:ml-60') : 'md:ml-60',
        ].join(' ')}
      >
        {children}
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav />
    </div>
  );
}
