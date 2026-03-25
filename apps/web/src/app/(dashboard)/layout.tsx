import { Sidebar } from '@/components/layout/sidebar';
import { Suspense } from 'react';
import { DateRangeBar } from '@/components/layout/date-range-bar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-60 min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-900">GIP Insight</h1>
          <Suspense>
            <DateRangeBar />
          </Suspense>
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
