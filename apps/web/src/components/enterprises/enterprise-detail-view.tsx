'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getEnterprise, getJobSummary } from '@/lib/api-client';
import { getPresetRange, toIso, formatDate, statusColor, cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, AlertCircle, Activity, ArrowLeft, GitBranch, Database } from 'lucide-react';

export function EnterpriseDetailView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const from = searchParams.get('from') || toIso(getPresetRange('24h').from);
  const to = searchParams.get('to') || toIso(new Date());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise-detail', ssoEnterpriseId, from, to],
    queryFn: () => getEnterprise(ssoEnterpriseId, { from, to }),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['job-summary', ssoEnterpriseId, from, to],
    queryFn: () => getJobSummary(ssoEnterpriseId, { from, to }),
  });

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  const enterprise = data?.data?.enterprise;
  const connectors = data?.data?.connectors || [];
  const totals = summaryData?.data?.totals || {};

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
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{enterprise?.tradeName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{enterprise?.legalName}</p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <GitBranch className="w-3.5 h-3.5" />
                <span className="font-mono">{enterprise?.ssoEnterpriseId}</span>
              </div>
              {enterprise?.dbName && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Database className="w-3.5 h-3.5" />
                  <span className="font-mono">{enterprise?.dbName}</span>
                </div>
              )}
              {enterprise?.baCode && (
                <Badge variant="muted">{enterprise?.baCode}</Badge>
              )}
            </div>
          </div>
          <Link
            href={`/enterprises/${ssoEnterpriseId}/sync-gap?from=${from}&to=${to}`}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <Activity className="w-4 h-4" />
            Sync Gap Analysis
          </Link>
        </div>
      </div>

      {/* Job metrics */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Total Jobs" value={totals.total ?? 0} color="default" />
        <StatCard label="Success" value={totals.success ?? 0} color="green" />
        <StatCard label="Failed" value={totals.failed ?? 0} color={totals.failed > 0 ? 'red' : 'default'} />
        <StatCard label="Pending" value={totals.pending ?? 0} color="yellow" />
        <StatCard
          label="Failure Rate"
          value={`${totals.failure_rate ?? 0}%`}
          color={totals.failure_rate > 10 ? 'red' : totals.failure_rate >= 2 ? 'yellow' : 'green'}
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 text-sm">{c.name}</p>
            <Badge variant={statusBadge}>{statusLabel}</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
            <span className="font-medium">{c.outboundApp?.name || 'Unknown'}</span>
            <span>→</span>
            <span className="font-medium">{c.inboundApp?.name || 'Unknown'}</span>
          </div>
        </div>
        <div className="flex items-center gap-6 ml-4">
          <div className="text-center">
            <p className="text-xs text-gray-400">Jobs</p>
            <p className="font-semibold text-gray-800">{m.total_jobs ?? 0}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Failed</p>
            <p className={cn('font-semibold', m.failed > 0 ? 'text-red-600' : 'text-gray-400')}>
              {m.failed ?? 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Fail %</p>
            <p className={cn('font-semibold text-sm', m.failure_rate > 10 ? 'text-red-600' : m.failure_rate >= 2 ? 'text-yellow-600' : 'text-gray-500')}>
              {m.failure_rate ?? 0}%
            </p>
          </div>
          {m.failed > 0 && (
            <button
              onClick={onViewJobs}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium"
            >
              <AlertCircle className="w-3.5 h-3.5" /> View Failures
            </button>
          )}
        </div>
      </div>

      {/* Event mappings */}
      {c.mappings?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          <div className="flex flex-wrap gap-2">
            {c.mappings.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                <span className="font-mono text-gray-600">{m.outboundEvent?.eventCode || '?'}</span>
                <span>→</span>
                <span className="font-mono text-gray-600">{m.inboundEvent?.eventCode || '?'}</span>
                {!m.isEnabled && <span className="text-yellow-500 ml-1">(off)</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
