'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getEnterprise } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, AlertCircle, Activity, ArrowLeft, GitBranch, Database } from 'lucide-react';

export function EnterpriseDetailView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const router = useRouter();
  const { from, to } = useDateRange();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise-detail', ssoEnterpriseId, from, to],
    queryFn: () => getEnterprise(ssoEnterpriseId, { from, to }),
  });

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  const enterprise = data?.data?.enterprise;
  const connectors = data?.data?.connectors || [];
  const totals = data?.data?.totals || {};

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => router.push('/enterprises')} className="flex items-center gap-1 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" /> Enterprises
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">{enterprise?.tradeName}</span>
      </div>

      {/* Enterprise header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{enterprise?.tradeName}</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{enterprise?.legalName}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <GitBranch className="w-3 h-3 shrink-0" />
                <span className="font-mono truncate max-w-[140px] sm:max-w-none">{enterprise?.ssoEnterpriseId}</span>
              </div>
              {enterprise?.dbName && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Database className="w-3 h-3 shrink-0" />
                  <span className="font-mono truncate max-w-[120px] sm:max-w-none">{enterprise?.dbName}</span>
                </div>
              )}
              {enterprise?.baCode && <Badge variant="muted">{enterprise?.baCode}</Badge>}
            </div>
          </div>
          <Link
            href={`/enterprises/${ssoEnterpriseId}/sync-gap?from=${from}&to=${to}`}
            className="flex items-center gap-1.5 text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
          >
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Sync Gap Analysis</span>
            <span className="sm:hidden">Sync Gap</span>
          </Link>
        </div>
      </div>

      {/* Job metrics — all values are invoice-level, not raw job counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Zwing Invoices" value={totals.total ?? 0} color="default" sub="in selected window" />
        <StatCard label="Succeeded" value={totals.success ?? 0} color="green" sub="delivered successfully" />
        <StatCard label="Failed" value={totals.failed ?? 0} color={(totals.failed ?? 0) > 0 ? 'red' : 'default'} sub="no success for any connector" />
        <StatCard label="Pending" value={totals.pending ?? 0} color={(totals.pending ?? 0) > 0 ? 'yellow' : 'default'} sub="GIP job in-flight" />
        <StatCard label="Not Captured" value={totals.missing ?? 0} color={(totals.missing ?? 0) > 0 ? 'yellow' : 'default'} sub="no GIP job found" />
        <StatCard
          label="Success Rate"
          value={`${totals.success_rate ?? 0}%`}
          color={(totals.success_rate ?? 0) >= 98 ? 'green' : (totals.success_rate ?? 0) >= 90 ? 'yellow' : 'red'}
          sub="invoices delivered"
        />
      </div>

      {/* Connectors */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Connectors</h3>
        {connectors.length === 0 ? (
          <EmptyState message="No connectors configured" />
        ) : (
          <div className="space-y-3">
            {connectors.map((c: any) => (
              <ConnectorCard
                key={c._id}
                connector={c}
                onViewJobs={() =>
                  router.push(`/jobs?ssoEnterpriseId=${ssoEnterpriseId}&connectorId=${c._id}&from=${from}&to=${to}`)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorCard({ connector: c, onViewJobs }: { connector: any; onViewJobs: () => void }) {
  const m = c.metrics || {};
  const isDeleted = !!c.deletedOn;
  const statusBadge = isDeleted ? 'danger' : c.isEnabled ? 'success' : 'warning';
  const statusLabel = isDeleted ? 'Deleted' : c.isEnabled ? 'Active' : 'Disabled';

  const hasEventMetrics = c.mappings?.some((mp: any) => mp.metrics !== null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Connector name + badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-900 text-sm">{c.name}</p>
            <Badge variant={statusBadge}>{statusLabel}</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
            <span className="font-medium">{c.outboundApp?.name || 'Unknown'}</span>
            <span>→</span>
            <span className="font-medium">{c.inboundApp?.name || 'Unknown'}</span>
          </div>
        </div>
        {m.failed > 0 && (
          <button
            onClick={onViewJobs}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium shrink-0"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">View Failures</span>
            <span className="sm:hidden">Failures</span>
          </button>
        )}
      </div>

      {/* Connector-level summary stats — 4-col grid on all sizes */}
      <div className="grid grid-cols-4 gap-2 text-center mb-1">
        <div>
          <p className="text-[10px] text-green-500 mb-0.5">Succeeded</p>
          <p className={cn('text-sm font-semibold', (m.succeeded ?? 0) > 0 ? 'text-green-600' : 'text-gray-400')}>
            {m.succeeded ?? 0}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-red-400 mb-0.5">Failed</p>
          <p className={cn('text-sm font-semibold', (m.failed ?? 0) > 0 ? 'text-red-600' : 'text-gray-400')}>
            {m.failed ?? 0}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-yellow-500 mb-0.5">Pending</p>
          <p className={cn('text-sm font-semibold', (m.pending ?? 0) > 0 ? 'text-yellow-600' : 'text-gray-400')}>
            {m.pending ?? 0}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Success %</p>
          <p className={cn(
            'text-sm font-semibold',
            (m.success_rate ?? 0) >= 98 ? 'text-green-600' :
            (m.success_rate ?? 0) >= 90 ? 'text-yellow-600' :
            'text-red-600',
          )}>
            {m.success_rate ?? 0}%
          </p>
        </div>
      </div>

      {/* Event-wise breakdown table — horizontally scrollable */}
      {c.mappings?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pb-1.5 font-medium">Event</th>
                <th className="pb-1.5 font-medium text-right pr-3">OK</th>
                <th className="pb-1.5 font-medium text-right pr-3">Fail</th>
                <th className="pb-1.5 font-medium text-right pr-3">Pend</th>
                <th className="pb-1.5 font-medium text-right">Rate</th>
                <th className="pb-1.5 w-14"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {c.mappings.map((mp: any) => {
                const em = mp.metrics;
                return (
                  <tr key={mp._id} className="text-gray-700">
                    <td className="py-1.5 pr-3">
                      <div className="space-y-0.5">
                        <span className="font-mono text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded text-[10px] block truncate max-w-[180px]">
                          {mp.outboundEvent?.eventCode || '?'}
                        </span>
                        <span className="font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded text-[10px] block truncate max-w-[180px]">
                          → {mp.inboundEvent?.eventCode || '?'}
                        </span>
                        {!mp.isEnabled && <span className="text-[10px] text-yellow-500 font-medium">off</span>}
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {em ? <span className={cn('font-medium', em.succeeded > 0 ? 'text-green-600' : 'text-gray-400')}>{em.succeeded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {em ? <span className={cn('font-medium', em.failed > 0 ? 'text-red-600' : 'text-gray-400')}>{em.failed}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {em ? <span className={cn('font-medium', em.pending > 0 ? 'text-yellow-600' : 'text-gray-400')}>{em.pending}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 text-right">
                      {em ? (
                        <span className={cn('font-semibold', em.success_rate >= 98 ? 'text-green-600' : em.success_rate >= 90 ? 'text-yellow-600' : 'text-red-600')}>
                          {em.success_rate}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      {!mp.isEnabled
                        ? <span className="text-[10px] px-1.5 py-0.5 bg-yellow-50 text-yellow-600 rounded font-medium">Off</span>
                        : em?.failed > 0
                          ? <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">Fail</span>
                          : em?.succeeded > 0
                            ? <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded font-medium">OK</span>
                            : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!hasEventMetrics && (
            <p className="text-xs text-gray-400 mt-1">No jobs found for this window</p>
          )}
        </div>
      )}
    </div>
  );
}
