'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { getEnterprises, getEnterpriseFailedSummary, getFailedJobs } from '@/lib/api-client';
import { getPresetRange, toIso, formatDate, cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { AlertCircle, ChevronRight, ChevronLeft, ArrowLeft, RefreshCw } from 'lucide-react';
import { useState } from 'react';

// ─── Per-enterprise row: async failed summary ────────────────────────────────

function Skeleton({ w = 'w-12' }: { w?: string }) {
  return <span className={cn('inline-block h-3.5 rounded bg-gray-100 animate-pulse', w)} />;
}

function EnterpriseFailedRow({
  enterprise,
  from,
  to,
  onClick,
}: {
  enterprise: any;
  from: string;
  to: string;
  onClick: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['enterprise-failed-summary', enterprise.ssoEnterpriseId, from, to],
    queryFn: () => getEnterpriseFailedSummary(enterprise.ssoEnterpriseId, { from, to }),
    staleTime: 60_000,
  });

  const summary = data?.data;
  const count = summary?.count ?? 0;
  const latestJob = summary?.jobs?.[0];

  // Don't render rows with zero failures once loaded
  if (!isLoading && count === 0) return null;

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-gray-50 transition-colors"
    >
      {/* Enterprise */}
      <td className="px-4 py-3.5">
        <p className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
          {enterprise.tradeName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">
          {enterprise.baCode || enterprise.ssoEnterpriseId?.slice(0, 14) + '…'}
        </p>
      </td>

      {/* Apps */}
      <td className="px-4 py-3.5">
        <div className="flex flex-wrap gap-1">
          {enterprise.apps?.slice(0, 2).map((app: any) => (
            <span
              key={app._id}
              className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100"
            >
              {app.name}
            </span>
          ))}
          {enterprise.apps?.length > 2 && (
            <span className="text-[10px] text-gray-400">+{enterprise.apps.length - 2}</span>
          )}
        </div>
      </td>

      {/* Failed count */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? (
          <Skeleton w="w-8" />
        ) : (
          <span className="font-semibold text-red-600">{count}</span>
        )}
      </td>

      {/* Latest error */}
      <td className="px-4 py-3.5 max-w-[260px]">
        {isLoading ? (
          <Skeleton w="w-40" />
        ) : latestJob ? (
          <p className="text-xs text-red-500 truncate" title={latestJob.error}>
            {latestJob.error || '—'}
          </p>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )}
      </td>

      {/* Latest connector */}
      <td className="px-4 py-3.5">
        {isLoading ? (
          <Skeleton w="w-24" />
        ) : (
          <span className="text-xs text-gray-500">{latestJob?.connectorName || '—'}</span>
        )}
      </td>

      {/* Latest date */}
      <td className="px-4 py-3.5">
        {isLoading ? (
          <Skeleton w="w-20" />
        ) : (
          <span className="text-xs text-gray-500">
            {latestJob ? formatDate(latestJob.transactionDate) : '—'}
          </span>
        )}
      </td>

      <td className="px-3 py-3.5">
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </td>
    </tr>
  );
}

// ─── Drill-down: paginated job list for one enterprise ────────────────────────

function EnterpriseJobList({
  ssoEnterpriseId,
  tradeName,
  from,
  to,
  onBack,
}: {
  ssoEnterpriseId: string;
  tradeName: string;
  from: string;
  to: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['failed-jobs', ssoEnterpriseId, from, to, page],
    queryFn: () => getFailedJobs({ from, to, ssoEnterpriseId, page, limit: 50 }),
    staleTime: 60_000,
  });

  const jobs = data?.data || [];
  const meta = data?.meta || {};
  const totalPages = Math.ceil((meta.total || 0) / 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4" /> All enterprises
          </button>
          <span className="text-gray-300">|</span>
          <h3 className="text-sm font-semibold text-gray-900">{tradeName}</h3>
          {meta.total > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">
              {meta.total} failed
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading jobs…</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-red-500">Failed to load jobs</div>
      ) : jobs.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No failed jobs in this window</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice / RefDoc</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Connector</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Error</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Retries</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map((job: any) => (
                <tr key={job._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-gray-800">{job.refDocNo || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-600">{job.connector?.name || '—'}</p>
                    {job.outboundApp && job.inboundApp && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {job.outboundApp.name} → {job.inboundApp.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-500">{job.event?.eventCode || '—'}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-xs text-red-600 truncate" title={job.error}>{job.error || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-gray-500">{job.retryCount ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{formatDate(job.transactionDate)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/jobs/${job._id}`)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">
                {(page - 1) * 50 + 1}–{Math.min(page * 50, meta.total)} of {meta.total}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-40">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs">{page}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-gray-200 disabled:opacity-40">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function FailedJobsView() {
  const searchParams = useSearchParams();
  const [selectedEnterprise, setSelectedEnterprise] = useState<{ ssoEnterpriseId: string; tradeName: string } | null>(null);
  const [search, setSearch] = useState('');

  const from = searchParams.get('from') || toIso(getPresetRange('24h').from);
  const to = searchParams.get('to') || toIso(new Date());

  // 1️⃣ Fast: load enterprise stubs (same as enterprise page — uses cache if already visited)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise-stubs', search],
    queryFn: () => getEnterprises({ search: search || undefined }),
    staleTime: 30_000,
  });

  const enterprises = data?.data || [];

  // Drill-down: show jobs for a selected enterprise
  if (selectedEnterprise) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Failed Jobs</h2>
          <p className="text-sm text-gray-500 mt-1">Drill-down view for selected enterprise</p>
        </div>
        <EnterpriseJobList
          ssoEnterpriseId={selectedEnterprise.ssoEnterpriseId}
          tradeName={selectedEnterprise.tradeName}
          from={from}
          to={to}
          onBack={() => setSelectedEnterprise(null)}
        />
      </div>
    );
  }

  // Default: enterprise list with async failed counts per row
  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Failed Jobs</h2>
          <p className="text-sm text-gray-500 mt-1">
            Select an enterprise to view its failed jobs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-gray-500">
            Counts load per enterprise
          </span>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search enterprise…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-56 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
      />

      {enterprises.length === 0 ? (
        <EmptyState message="No enterprises found" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Enterprise</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Apps</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Failed Jobs</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Latest Error</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Connector</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Latest Failure</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enterprises.map((e: any) => (
                <EnterpriseFailedRow
                  key={e.ssoEnterpriseId}
                  enterprise={e}
                  from={from}
                  to={to}
                  onClick={() => setSelectedEnterprise({ ssoEnterpriseId: e.ssoEnterpriseId, tradeName: e.tradeName })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
