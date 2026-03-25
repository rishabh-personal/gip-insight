'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSyncGap } from '@/lib/api-client';
import { getPresetRange, toIso, formatDate, cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { ArrowLeft, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

export function SyncGapView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const from = searchParams.get('from') || toIso(getPresetRange('24h').from);
  const to = searchParams.get('to') || toIso(new Date());

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sync-gap', ssoEnterpriseId, from, to],
    queryFn: () => getSyncGap(ssoEnterpriseId, { from, to }),
  });

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  const d = data?.data;
  if (!d) return <EmptyState message="No data for this enterprise" />;

  const missed = d.missedEvents || [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button
          onClick={() => router.push(`/enterprises/${ssoEnterpriseId}?from=${from}&to=${to}`)}
          className="flex items-center gap-1 hover:text-gray-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {d.enterprise?.tradeName || ssoEnterpriseId}
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium">Sync Gap Analysis</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Sync Gap</h2>
          <p className="text-sm text-gray-500 mt-1">
            Zwing invoices vs GIP captured events — {d.enterprise?.dbName && (
              <span className="font-mono text-xs">{d.enterprise.dbName}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Zwing Invoices"
          value={d.zwingCount ?? '—'}
          color="default"
          sub="in selected window"
        />
        <StatCard
          label="GIP Events"
          value={d.gipCount ?? 0}
          color="blue"
          sub="captured by Debezium"
        />
        <StatCard
          label="Sync Gap"
          value={d.gap ?? '—'}
          color={d.gap > 0 ? 'red' : 'green'}
          sub={d.gap > 0 ? 'invoices missed by GIP' : 'no gap detected'}
        />
        <StatCard
          label="Sync Rate"
          value={`${d.syncRate ?? '—'}%`}
          color={d.syncRate >= 99 ? 'green' : d.syncRate >= 90 ? 'yellow' : 'red'}
          sub="invoices captured"
        />
      </div>

      {/* Alert banner */}
      {d.gap > 0 ? (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              {d.gap} invoice{d.gap > 1 ? 's' : ''} were not captured by GIP
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              These invoices exist in Zwing but have no matching GIP job. This indicates a possible
              Debezium connector break or Kafka lag.
            </p>
          </div>
        </div>
      ) : d.zwingCount !== null ? (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <p className="text-sm font-medium text-green-700">
            All Zwing invoices in this window have been captured by GIP — no sync gap detected.
          </p>
        </div>
      ) : null}

      {/* Error message */}
      {d.error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
          {d.error}
        </div>
      )}

      {/* Missed events table */}
      {missed.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Missed Events ({missed.length}{d.gap > 500 ? '+' : ''})
            </h3>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Store</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sub Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {missed.map((inv: any) => (
                  <tr key={inv.invoice_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_id}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{inv.store_id}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{inv.transaction_type}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{inv.transaction_sub_type || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{inv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(inv.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/trace?invoiceId=${inv.invoice_id}&ssoEnterpriseId=${ssoEnterpriseId}`)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Trace →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.gap > 500 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                Showing first 500 of {d.gap} missed events
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
