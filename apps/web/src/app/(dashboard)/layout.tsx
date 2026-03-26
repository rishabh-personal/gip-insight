import { Suspense } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { DateRangeBar } from '@/components/layout/date-range-bar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      {/* Top bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-base font-semibold text-gray-900">GIP Insight</h1>
        <Suspense fallback={null}>
          <DateRangeBar />
        </Suspense>
      </header>
      {/* Page content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </DashboardShell>
  );
}
