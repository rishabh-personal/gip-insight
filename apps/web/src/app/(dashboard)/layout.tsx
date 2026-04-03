import { Suspense } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { DateRangeBar } from '@/components/layout/date-range-bar';
import { Zap } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        {/* Row 1: title */}
        <div className="h-14 flex items-center justify-between px-4 md:px-6">
          {/* Mobile: show brand mark (sidebar is hidden on mobile) */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900">GIP Insight</span>
          </div>
          {/* Desktop: page title area */}
          <h1 className="hidden md:block text-base font-semibold text-gray-900">GIP Insight</h1>

          {/* Date range bar — hidden on smallest screens, shown inline on sm+ */}
          <div className="hidden sm:block">
            <Suspense fallback={null}>
              <DateRangeBar />
            </Suspense>
          </div>
        </div>

        {/* Row 2 (mobile only): date range bar in its own scrollable row */}
        <div className="sm:hidden border-t border-gray-100 px-4 py-2 overflow-x-auto">
          <Suspense fallback={null}>
            <DateRangeBar compact />
          </Suspense>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </DashboardShell>
  );
}
