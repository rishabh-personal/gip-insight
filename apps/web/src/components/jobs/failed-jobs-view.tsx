'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { getEnterprises, getEnterpriseFailedSummary, getFailedJobs } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { formatDate, cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { AlertCircle, ChevronRight, ChevronLeft, ArrowLeft, RefreshCw } from 'lucide-react';
import { useState } from 'react';

function Skeleton({ w = 'w-12' }: { w?: string }) {
  return <span className={cn('inline-block h-3.5 rounded bg-gray-100 animate-pulse', w)} />;
}

// ─── Shared data hook ────────────────────────────────────────────────────────

function useEnterpriseFailed(ssoEnterpriseId: string, from: string, to: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['enterprise-failed-summary', ssoEnterpriseId, from, to],
    queryFn: () => getEnterpriseFailedSummary(ssoEnterpriseId, { from, to }),
    staleTime: 60_000,
  });
  const count = data?.data?.count ?? 0;
  const latestJob = data?.data?.jobs?.[0];
  return { isLoading, count, latestJob };
}

// ─── Mobile card ─────────────────────────────────────────────────────────────

function EnterpriseFailedCard({
  enterprise, from, to, onClick,
}: { enterprise: any; from: string; to: string; onClick: () => void }) {
  const { isLoading, count, latestJob } = useEnterpriseFailed(enterprise.ssoEnterpriseId, from, to);
  if (!isLoading && count === 0) return null;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{enterprise.tradeName}</p>
          <p className="text-xs text-gray-400 font-mono">
            {enterprise.baCode || enterprise.ssoEnterpriseId?.slice(0, 14) + '…'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLoading ? <Skeleton w="w-8" /> : <span className="text-lg font-bold text-red-600">{count}</span>}
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
      {latestJob?.error && <p className="text-xs text-red-500 truncate">{latestJob.error}</p>}
      {latestJob?.connectorName && <p className="text-xs text-gray-400 mt-0.5">{latestJob.connectorName}</p>}
    </div>
  );
}

// ─── Desktop table row ────────────────────────────────────────────────────────

function EnterpriseFailedRow({
  enterprise, from, to, onClick,
}: { enterprise: any; from: string; to: string; onClick: () => void }) {
  const { isLoading, count, latestJob } = useEnterpriseFailed(enterprise.ssoEnterpriseId, from, to);
  if (!isLoading && count === 0) return null;

  return (
    <tr onClick={onClick} className="cursor-pointer hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3.5">
        <p className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{enterprise.tradeName}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">
          {enterprise.baCode || enterprise.ssoEnterpriseId?.slice(0, 14) + '…'}
        </p>
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {enterprise.apps?.slice(0, 2).map((app: any) => (
            <span key={app._id} className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
              {app.name}
            </span>
          ))}
          {enterprise.apps?.length > 2 && <span className="text-[10px] text-gray-400">+{enterprise.apps.length - 2}</span>}
        </div>
      </td>
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : <span className="font-semibold text-red-600">{count}</span>}
      </td>
      <td className="px-4 py-3.5 max-w-[260px] hidden md:table-cell">
        {isLoading ? <Skeleton w="w-40" /> : latestJob
          ? <p className="text-xs text-red-500 truncate" title={latestJob.error}>{latestJob.error || '—'}</p>
          : <span className="text-gray-400 text-xs">—</span>}
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        {isLoading ? <Skeleton w="w-24" /> : <span className="text-xs text-gray-500">{latestJob?.connectorName || '—'}</span>}
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        {isLoading ? <Skeleton w="w-20" /> : <span className="text-xs text-gray-500">{latestJob ? formatDate(latestJob.transactionDate) : '—'}</span>}
      </td>
      <td className="px-3 py-3.5">
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </td>
    </tr>
  );
}

// ─── Drill-down job list ───────────────────────────────────────────────────────

function EnterpriseJobList({
  ssoEnterpriseId, connectorId, tradeName, from, to, onBack,
}: { ssoEnterpriseId: string; connectorId?: string; tradeName: string; from: string; to: string; onBack: () => void }) {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['failed-jobs', ssoEnterpriseId, connectorId, from, to, page],
    queryFn: () => getFailedJobs({ from, to, ssoEnterpriseId, connectorId, page, limit: 50 }),
    staleTime: 60_000,
  });

  const jobs = data?.data || [];
  const meta = data?.meta || {};
  const totalPages = Math.ceil((meta.total || 0) / 50);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 shrink-0">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-gray-300">|</span>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{tradeName}</h3>
          {connectorId && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
              connector filter
            </span>
          )}
          {meta.total > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100 shrink-0">
              {meta.total} failed
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0"
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
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {jobs.map((job: any) => (
              <div
                key={job._id}
                onClick={() => router.push(`/jobs/${job._id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-mono text-sm text-gray-800 font-medium">{job.refDocNo || '—'}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {(job.failedAttempts ?? 1) > 1 && (
                      <span className="text-xs font-medium text-orange-500">{job.failedAttempts}×</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-1">
                  {job.connector?.name || '—'}{job.outboundApp && job.inboundApp ? ` · ${job.outboundApp.name} → ${job.inboundApp.name}` : ''}
                </p>
                {job.error && (
                  <p className="text-xs text-red-500 truncate">{job.error}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">{formatDate(job.transactionDate)}</p>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice / RefDoc</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Connector</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Error</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Attempts</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job: any) => (
                  <tr key={job._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><p className="font-mono text-xs text-gray-800">{job.refDocNo || '—'}</p></td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-600">{job.connector?.name || '—'}</p>
                      {job.outboundApp && job.inboundApp && (
                        <p className="text-xs text-gray-400 mt-0.5">{job.outboundApp.name} → {job.inboundApp.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="font-mono text-xs text-gray-500">{job.event?.eventCode || '—'}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-xs text-red-600 truncate" title={job.error}>{job.error || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('text-xs font-medium', (job.failedAttempts ?? 1) > 1 ? 'text-orange-500' : 'text-gray-400')}>
                        {job.failedAttempts ?? 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
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
                <span className="text-xs text-gray-500">{(page - 1) * 50 + 1}–{Math.min(page * 50, meta.total)} of {meta.total}</span>
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

          {/* Mobile pagination */}
          {totalPages > 1 && (
            <div className="md:hidden flex items-center justify-between px-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-xs text-gray-500">{page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg disabled:opacity-40">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────────

export function FailedJobsView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlEnterpriseId = searchParams.get('ssoEnterpriseId') || '';
  const urlConnectorId  = searchParams.get('connectorId') || '';

  const [selectedEnterprise, setSelectedEnterprise] = useState<{
    ssoEnterpriseId: string; connectorId?: string; tradeName: string;
  } | null>(
    urlEnterpriseId
      ? { ssoEnterpriseId: urlEnterpriseId, connectorId: urlConnectorId || undefined, tradeName: urlEnterpriseId }
      : null,
  );
  const [search, setSearch] = useState('');
  const { from, to } = useDateRange();

  const { data: stubsData } = useQuery({
    queryKey: ['enterprise-stubs'],
    queryFn: () => getEnterprises({}),
    staleTime: 30_000,
    enabled: !!urlEnterpriseId,
  });
  const resolvedTradeName: string =
    stubsData?.data?.find((e: any) => e.ssoEnterpriseId === urlEnterpriseId)?.tradeName
    ?? selectedEnterprise?.tradeName ?? urlEnterpriseId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise-stubs', search],
    queryFn: () => getEnterprises({ search: search || undefined }),
    staleTime: 30_000,
    enabled: !selectedEnterprise,
  });

  const enterprises = data?.data || [];

  const handleBack = () => {
    setSelectedEnterprise(null);
    router.push('/jobs');
  };

  if (selectedEnterprise) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Failed Jobs</h2>
          <p className="text-sm text-gray-500 mt-1">Filtered view</p>
        </div>
        <EnterpriseJobList
          ssoEnterpriseId={selectedEnterprise.ssoEnterpriseId}
          connectorId={selectedEnterprise.connectorId}
          tradeName={resolvedTradeName}
          from={from}
          to={to}
          onBack={handleBack}
        />
      </div>
    );
  }

  if (isLoading) return <PageLoader />;
  if (isError)   return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Failed Jobs</h2>
          <p className="text-sm text-gray-500 mt-1">Select an enterprise</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="hidden sm:inline">Counts load per enterprise</span>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search enterprise…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-56 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
      />

      {enterprises.length === 0 ? (
        <EmptyState message="No enterprises found" />
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {enterprises.map((e: any) => (
              <EnterpriseFailedCard
                key={e.ssoEnterpriseId}
                enterprise={e}
                from={from}
                to={to}
                onClick={() => setSelectedEnterprise({ ssoEnterpriseId: e.ssoEnterpriseId, tradeName: e.tradeName })}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Enterprise</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Apps</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Failed Jobs</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Latest Error</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Connector</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Latest Failure</th>
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
        </>
      )}
    </div>
  );
}
