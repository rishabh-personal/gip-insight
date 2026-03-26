'use client';

import { useQuery } from '@tanstack/react-query';
import { getEnterprises, getEnterpriseApps } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { EnterpriseTable } from './enterprise-table';
import { Building2, Layers, Search, X } from 'lucide-react';
import { useState, useMemo } from 'react';

export function EnterpriseListView() {
  const [search, setSearch] = useState('');
  const [selectedAppName, setSelectedAppName] = useState<string>('');

  const { from, to } = useDateRange();

  // 1️⃣ Fast: load enterprise stubs (apps-based, no metrics)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['enterprise-stubs', search, selectedAppName],
    queryFn: () => getEnterprises({ search: search || undefined, appName: selectedAppName || undefined }),
    staleTime: 30_000,
  });

  // 2️⃣ Load app list for filter dropdown
  const { data: appsData } = useQuery({
    queryKey: ['enterprise-apps'],
    queryFn: getEnterpriseApps,
    staleTime: 300_000,
  });

  const enterprises = useMemo(() => data?.data || [], [data]);
  const apps = useMemo(() => appsData?.data || [], [appsData]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState message={(error as any)?.message || 'Failed to load enterprises'} />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Enterprises</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enterprises with active app integrations — metrics load per row
        </p>
      </div>

      {/* KPI cards — stub counts only (fast) */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Enterprises with Apps"
          value={enterprises.length}
          icon={Building2}
          color="default"
        />
        <StatCard
          label="Unique Apps"
          value={apps.length}
          icon={Layers}
          color="default"
          sub="connected integrations"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search enterprise…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-56"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* App filter — by name, since apps are private per enterprise */}
        <select
          value={selectedAppName}
          onChange={(e) => setSelectedAppName(e.target.value)}
          className="py-2 pl-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-700"
        >
          <option value="">All Apps</option>
          {apps.map((app: any) => (
            <option key={app._id} value={app.name}>
              {app.name}
            </option>
          ))}
        </select>

        {selectedAppName && (
          <button
            onClick={() => setSelectedAppName('')}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear filter
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {enterprises.length} enterprise{enterprises.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table — each row fetches its own metrics async */}
      {enterprises.length === 0 ? (
        <EmptyState message="No enterprises with active app integrations found" />
      ) : (
        <EnterpriseTable
          enterprises={enterprises}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}
