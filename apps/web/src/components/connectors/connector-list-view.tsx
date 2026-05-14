'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getConnectorCatalog } from '@/lib/api-client';
import { PageLoader, ErrorState } from '@/components/ui/loading';
import { Zap, Building2, Layers, ChevronRight, Search, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// ── Event chip colours (cycle through palette by index) ───────────────────────

const CHIP_COLOURS = [
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-sky-50    text-sky-700    border-sky-200',
  'bg-teal-50   text-teal-700   border-teal-200',
  'bg-amber-50  text-amber-700  border-amber-200',
  'bg-rose-50   text-rose-700   border-rose-200',
];

function EventChip({ label, index }: { label: string; index: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
        CHIP_COLOURS[index % CHIP_COLOURS.length],
      )}
    >
      {label}
    </span>
  );
}

// ── Connector card ─────────────────────────────────────────────────────────────

interface ConnectorEntry {
  name: string;
  enterpriseCount: number;
  events: { eventCode: string; label: string }[];
}

function ConnectorCard({
  connector,
  onClick,
}: {
  connector: ConnectorEntry;
  onClick: () => void;
}) {
  const hasEvents = connector.events.length > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full text-left p-5 rounded-2xl border border-gray-200 bg-white',
        'hover:border-indigo-300 hover:shadow-md transition-all duration-150',
        'flex flex-col gap-3',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
            <Zap className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 group-hover:text-indigo-700 transition-colors">
              {connector.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {connector.enterpriseCount} enterprise{connector.enterpriseCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" />
      </div>

      {/* Events */}
      {hasEvents ? (
        <div className="flex flex-wrap gap-1.5">
          {connector.events.map((ev, i) => (
            <EventChip key={ev.eventCode} label={ev.label} index={i} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 italic">No tracked events configured</p>
      )}
    </button>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="w-full p-5 rounded-2xl border border-gray-100 bg-gray-50 animate-pulse flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-200" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-16 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function ConnectorListView() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['connector-catalog'],
    queryFn: getConnectorCatalog,
    staleTime: 300_000,
  });

  const allConnectors: ConnectorEntry[] = data?.connectors ?? [];

  const filtered = search.trim()
    ? allConnectors.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : allConnectors;

  const handleSelect = (connectorName: string) => {
    router.push(`/enterprises?connectorName=${encodeURIComponent(connectorName)}`);
  };

  if (isError) {
    return <ErrorState message={(error as any)?.message || 'Failed to load connectors'} />;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Connector Health</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Select a connector to explore event health across all enterprises
        </p>
      </div>

      {/* Search + count row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 sm:flex-none sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search connector…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-full"
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

        {!isLoading && (
          <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
            <Layers className="w-3.5 h-3.5" />
            <span>
              {filtered.length} connector{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Layers className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">
            {search ? `No connectors matching "${search}"` : 'No connectors found'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <ConnectorCard key={c.name} connector={c} onClick={() => handleSelect(c.name)} />
          ))}
        </div>
      )}
    </div>
  );
}
