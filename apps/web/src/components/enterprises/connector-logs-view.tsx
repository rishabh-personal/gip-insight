'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getConnectorJobs } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import {
  ArrowLeft, ChevronRight, RefreshCw, CheckCircle2,
  XCircle, Clock, AlertCircle, Activity, ExternalLink, Search, X,
} from 'lucide-react';

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LogStatus = 'all' | 'success' | 'failed' | 'pending';

interface Job {
  _id: string;
  refDocNo: string | null;
  status: string;
  transactionDate: string;
  error?: string;
  failedAttempts?: number;
  connector?: { name: string };
  event?: { name: string; eventCode: string };
  outboundApp?: { name: string };
  inboundApp?: { name: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_TABS: { key: LogStatus; label: string; icon: React.ElementType; cls: string }[] = [
  { key: 'all',     label: 'All',     icon: Activity,      cls: 'text-gray-600'   },
  { key: 'success', label: 'Success', icon: CheckCircle2,  cls: 'text-green-600'  },
  { key: 'failed',  label: 'Failed',  icon: XCircle,       cls: 'text-red-600'    },
  { key: 'pending', label: 'Pending', icon: Clock,         cls: 'text-yellow-600' },
];

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cls =
    s === 'success'    ? 'bg-green-50 text-green-700 border-green-200' :
    s === 'failed'     ? 'bg-red-50 text-red-700 border-red-200' :
    s === 'processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    s === 'pending'    ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                         'bg-gray-50 text-gray-600 border-gray-200';
  const Icon =
    s === 'success'    ? CheckCircle2 :
    s === 'failed'     ? XCircle :
    s === 'processing' ? RefreshCw :
    s === 'pending'    ? Clock :
                         AlertCircle;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border', cls)}>
      <Icon className="w-2.5 h-2.5" />{status}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ─── Job row (mobile card) ────────────────────────────────────────────────────

function JobCard({ job, from, to }: { job: Job; from: string; to: string }) {
  return (
    <Link
      href={`/jobs/${job._id}?from=${from}&to=${to}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 font-mono truncate">
            {job.refDocNo ?? '—'}
          </p>
          {job.connector?.name && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{job.connector.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={job.status} />
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        </div>
      </div>
      {job.event?.name && <p className="text-xs text-indigo-600 truncate mb-1">{job.event.name}</p>}
      {job.error && <p className="text-xs text-red-500 truncate">{job.error}</p>}
      <p className="text-[10px] text-gray-400 mt-1">{fmtDate(job.transactionDate)}</p>
    </Link>
  );
}

// ─── Job row (desktop table) ──────────────────────────────────────────────────

function JobRow({ job, from, to }: { job: Job; from: string; to: string }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer group">
      <td className="px-4 py-3">
        <Link href={`/jobs/${job._id}?from=${from}&to=${to}`} className="block font-mono text-xs text-gray-800 group-hover:text-indigo-700">
          {job.refDocNo ?? '—'}
        </Link>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <StatusBadge status={job.status} />
        {(job.failedAttempts ?? 0) > 1 && (
          <span className="ml-1.5 text-[10px] text-gray-400">×{job.failedAttempts}</span>
        )}
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <p className="text-xs text-gray-600 truncate max-w-[160px]">{job.event?.name ?? '—'}</p>
        {job.event?.eventCode && (
          <p className="text-[10px] text-gray-400 font-mono truncate max-w-[160px]">{job.event.eventCode}</p>
        )}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <p className="text-xs text-red-500 truncate max-w-[220px]">{job.error || '—'}</p>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <p className="text-xs text-gray-500">{fmtDate(job.transactionDate)}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/jobs/${job._id}?from=${from}&to=${to}`}
          className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
        >
          View <ExternalLink className="w-3 h-3" />
        </Link>
      </td>
    </tr>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function ConnectorLogsView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { from, to } = useDateRange();

  const connectorId   = params.get('connectorId')   ?? undefined;
  const connectorName = params.get('connectorName') ?? 'Connector';
  const initialStatus = (params.get('status') as LogStatus) ?? 'all';

  const [status, setStatus]   = useState<LogStatus>(initialStatus);
  const [page, setPage]       = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset page when search or status changes
  useEffect(() => { setPage(1); }, [search, status]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['connector-logs', ssoEnterpriseId, connectorId, status, from, to, page, search],
    queryFn: () => getConnectorJobs(ssoEnterpriseId, {
      connectorId,
      status,
      from,
      to,
      page,
      limit: 30,
      search: search || undefined,
    }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const jobs: Job[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1 };
  const totalPages = Math.max(1, Math.ceil((meta.total ?? 0) / 30));

  if (isError) return <ErrorState />;

  const backHref = `/enterprises/${ssoEnterpriseId}?from=${from}&to=${to}`;

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => router.push(backHref)} className="flex items-center gap-1 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="truncate text-gray-900 font-medium">{connectorName}</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>Logs</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">{connectorName}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Job logs · {from?.slice(0, 10)} → {to?.slice(0, 10)}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-500 rounded-lg px-3 py-1.5 hover:bg-gray-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Status tabs + search bar row */}
      <div className="flex flex-col gap-0 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex gap-1 flex-1 overflow-x-auto">
            {STATUS_TABS.map(({ key, label, icon: Icon, cls }) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  status === key
                    ? `border-indigo-600 ${cls}`
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.slice(0, 3)}</span>
              </button>
            ))}
          </div>

          {/* Inline search */}
          <div className="relative shrink-0 mb-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search ref doc…"
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent w-44 sm:w-56 transition-all"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); searchRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Count + search hint */}
      {!isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>
            {meta.total ?? 0} job{(meta.total ?? 0) !== 1 ? 's' : ''}
            {status !== 'all' && ` · ${status}`}
          </span>
          {search && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5 text-[10px] font-medium">
              <Search className="w-2.5 h-2.5" />
              &ldquo;{search}&rdquo;
              <button onClick={() => setSearchInput('')} className="ml-0.5 hover:text-indigo-800">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
          {isFetching && <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />}
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading && <PageLoader />}
        {!isLoading && jobs.length === 0 && (
          <EmptyState message={
            search
              ? `No ${status === 'all' ? '' : status + ' '}jobs matching "${search}".`
              : `No ${status === 'all' ? '' : status + ' '}jobs found for this connector in the selected window.`
          } />
        )}
        {jobs.map((job) => <JobCard key={job._id} job={job} from={from} to={to} />)}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ref Doc</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Event</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Error</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto" />
                  </td>
                </tr>
              )}
              {!isLoading && jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <AlertCircle className="w-5 h-5 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">
                      {search
                        ? `No ${status === 'all' ? '' : status + ' '}jobs matching "${search}".`
                        : `No ${status === 'all' ? '' : status + ' '}jobs found for this connector.`}
                    </p>
                    {search && (
                      <button onClick={() => setSearchInput('')} className="mt-2 text-xs text-indigo-500 hover:underline">
                        Clear search
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {jobs.map((job) => <JobRow key={job._id} job={job} from={from} to={to} />)}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">{meta.total} total</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs px-2.5 py-1 text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
