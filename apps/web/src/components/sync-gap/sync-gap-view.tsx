'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getSyncGap, getPendingInvoices, retriggerInvoices } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { formatDate, cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import {
  ArrowLeft,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Zap,
  Clock,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type TabId = 'missing' | 'failed' | 'pending';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={cn(
        'p-0.5 rounded transition-colors',
        copied ? 'text-green-500' : 'text-gray-300 hover:text-gray-500',
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export function SyncGapView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  const { from, to } = useDateRange();

  const [activeTab, setActiveTab] = useState<TabId>('missing');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retriggerResult, setRetriggerResult] = useState<{ updated: number; batches: number } | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sync-gap', ssoEnterpriseId, from, to],
    queryFn: () => getSyncGap(ssoEnterpriseId, { from, to }),
  });

  const { data: pendingData, isLoading: pendingLoading, refetch: pendingRefetch, isFetching: pendingFetching } = useQuery({
    queryKey: ['pending-invoices', ssoEnterpriseId, from, to],
    queryFn: () => getPendingInvoices(ssoEnterpriseId, { from, to }),
    enabled: activeTab === 'pending',
  });

  const retriggerMutation = useMutation({
    mutationFn: (ids: string[]) => retriggerInvoices(ssoEnterpriseId, ids),
    onSuccess: (res) => {
      const r = res?.data;
      setRetriggerResult(r);
      setSelected(new Set());
      toast.success(
        `${r?.updated ?? 0} invoices re-triggered across ${r?.batches ?? 1} batch${(r?.batches ?? 1) > 1 ? 'es' : ''}`,
      );
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['sync-gap', ssoEnterpriseId] });
        qc.invalidateQueries({ queryKey: ['pending-invoices', ssoEnterpriseId] });
      }, 3000);
    },
    onError: (e: any) => toast.error(`Re-trigger failed: ${e?.message || 'Unknown error'}`),
  });

  if (isLoading) return <PageLoader />;
  if (isError)   return <ErrorState />;

  const d = data?.data;
  if (!d) return <EmptyState message="No data for this enterprise" />;

  const isRefreshing    = isFetching && !isLoading;
  const pendingInvoices = pendingData?.data?.pendingInvoices || [];
  const pendingCount    = pendingData?.data?.count ?? 0;

  // Response shape: d.missing.items / d.failed.items / pendingInvoices
  const missingItems = d.missing?.items || [];
  const failedItems  = d.failed?.items  || [];
  const missingCount = d.missing?.count ?? missingItems.length;
  const failedCount  = d.failed?.count  ?? failedItems.length;

  const activeList: any[] =
    activeTab === 'missing' ? missingItems :
    activeTab === 'failed'  ? failedItems  :
    pendingInvoices;

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSelected(new Set());
    setRetriggerResult(null);
  };

  const toggleAll = () => {
    if (selected.size === activeList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeList.map((inv: any) => String(inv.invoice_id))));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleRetrigger = () => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const batches = Math.ceil(ids.length / 1000);
    const msg = ids.length > 1000
      ? `Re-trigger ${ids.length} invoices in ${batches} batches of 1000?`
      : `Re-trigger ${ids.length} invoice${ids.length > 1 ? 's' : ''}?`;
    if (!confirm(msg)) return;
    retriggerMutation.mutate(ids);
  };

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
          <h2 className="text-xl font-semibold text-gray-900">
            Sync Gap — {d.label ?? 'Invoices'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {d.enterprise?.dbName
              ? <>Source ({d.enterprise.dbName}) vs GIP captured events</>
              : 'Source vs GIP captured events'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={cn(
            'flex items-center gap-1.5 text-sm bg-white border px-3 py-1.5 rounded-lg transition-colors',
            isFetching
              ? 'border-indigo-300 text-indigo-500 cursor-not-allowed'
              : 'border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300',
          )}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* KPI row */}
      <div className={cn('grid grid-cols-4 gap-4 transition-opacity duration-200', isRefreshing && 'opacity-40 pointer-events-none')}>
        <StatCard label="Source Records" value={d.zwingCount ?? '—'} color="default" sub="in selected window" />
        <StatCard label="GIP Captured"   value={d.gipCount ?? 0}     color="blue"    sub="unique records in GIP" />
        <StatCard
          label="Total Gap"
          value={d.gap ?? '—'}
          color={d.gap > 0 ? 'red' : 'green'}
          sub={d.gap > 0
            ? `${missingCount} not received · ${failedCount} failed`
            : 'all records delivered'}
        />
        <StatCard
          label="Sync Rate"
          value={`${d.syncRate ?? '—'}%`}
          color={d.syncRate >= 99 ? 'green' : d.syncRate >= 90 ? 'yellow' : 'red'}
          sub="successfully delivered"
        />
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {/* Missing tab */}
        <button
          onClick={() => handleTabChange('missing')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition-colors',
            activeTab === 'missing'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Not Received
          {missingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-600">{missingCount}</span>
          )}
        </button>

        {/* Failed tab */}
        <button
          onClick={() => handleTabChange('failed')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition-colors',
            activeTab === 'failed'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <XCircle className="w-3.5 h-3.5" />
          Failed in GIP
          {failedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-orange-100 text-orange-600">{failedCount}</span>
          )}
        </button>

        {/* Pending tab */}
        <button
          onClick={() => handleTabChange('pending')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition-colors',
            activeTab === 'pending'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          Pending in GIP
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-600">{pendingCount}</span>
          )}
        </button>
      </div>

      {/* Content — dimmed while re-fetching */}
      <div className={cn(
        'space-y-6 transition-opacity duration-200',
        (isRefreshing || (activeTab === 'pending' && pendingFetching && !pendingLoading)) && 'opacity-40 pointer-events-none',
      )}>

        {/* ── Not Received tab ──────────────────────────────────────────────── */}
        {activeTab === 'missing' && (
          missingCount > 0 ? (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">
                  {missingCount} record{missingCount > 1 ? 's' : ''} were never received by GIP
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  These exist in the source system but have no matching GIP job. Select them and click{' '}
                  <strong>Re-trigger</strong> to increment <code>sync_status</code> so Debezium re-emits the events.
                </p>
              </div>
            </div>
          ) : d.zwingCount !== null ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-green-700">
                All source records in this window have been received by GIP — no missing events.
              </p>
            </div>
          ) : null
        )}

        {/* ── Failed in GIP tab ─────────────────────────────────────────────── */}
        {activeTab === 'failed' && (
          failedCount > 0 ? (
            <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <XCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-orange-700">
                  {failedCount} record{failedCount > 1 ? 's' : ''} were received by GIP but all job attempts failed
                </p>
                <p className="text-xs text-orange-600 mt-0.5">
                  GIP captured these events but could not deliver them. Re-trigger to create a fresh job attempt.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-green-700">
                No failed records — every captured event has at least one successful delivery.
              </p>
            </div>
          )
        )}

        {/* ── Pending in GIP tab ────────────────────────────────────────────── */}
        {activeTab === 'pending' && (
          pendingLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading pending records…
            </div>
          ) : pendingCount > 0 ? (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-700">
                  {pendingCount} record{pendingCount > 1 ? 's' : ''} are in-flight (pending/processing)
                </p>
                <p className="text-xs text-yellow-600 mt-0.5">
                  GIP captured these events but the jobs haven't resolved yet. If stuck, re-trigger to create
                  a fresh attempt.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-green-700">
                No pending records — all captured events have resolved.
              </p>
            </div>
          )
        )}

        {/* Re-trigger success result */}
        {retriggerResult && (
          <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
            <Zap className="w-5 h-5 text-indigo-500 flex-shrink-0" />
            <p className="text-sm text-indigo-700">
              <strong>{retriggerResult.updated}</strong> invoice{retriggerResult.updated !== 1 ? 's' : ''} updated
              across <strong>{retriggerResult.batches}</strong> batch{retriggerResult.batches !== 1 ? 'es' : ''}.
              Debezium will re-emit events shortly — refresh in a few seconds.
            </p>
          </div>
        )}

        {d.error && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
            {d.error}
          </div>
        )}

        {/* Invoice table */}
        {activeList.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {activeTab === 'missing'
                  ? `Not Received (${activeList.length}${missingCount > 500 ? '+' : ''})`
                  : activeTab === 'failed'
                  ? `Failed in GIP (${activeList.length}${failedCount > 500 ? '+' : ''})`
                  : `Pending in GIP (${activeList.length})`}
              </h3>
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <span className="text-xs text-gray-500">{selected.size} selected</span>
                )}
                <button
                  onClick={() => { activeTab === 'pending' ? pendingRefetch() : refetch(); }}
                  disabled={isFetching || pendingFetching}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg bg-white"
                >
                  <RefreshCw className={cn('w-3 h-3', (isFetching || pendingFetching) && 'animate-spin')} />
                </button>
                <button
                  onClick={handleRetrigger}
                  disabled={!selected.size || retriggerMutation.isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    selected.size > 0 && !retriggerMutation.isPending
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                  )}
                >
                  <Zap className={cn('w-3.5 h-3.5', retriggerMutation.isPending && 'animate-pulse')} />
                  {retriggerMutation.isPending
                    ? 'Re-triggering…'
                    : `Re-trigger${selected.size > 0 ? ` (${selected.size})` : ''}`}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={activeList.length > 0 && selected.size === activeList.length}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Store</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sub Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    {activeTab === 'pending' && (
                      <>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last GIP Attempt</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Job ID</th>
                      </>
                    )}
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeList.map((inv: any) => {
                    const id = String(inv.invoice_id);
                    const isChecked = selected.has(id);
                    return (
                      <tr
                        key={id}
                        onClick={() => toggleOne(id)}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isChecked ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50',
                        )}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_id}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{inv.store_id}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{inv.transaction_type}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{inv.transaction_sub_type || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{inv.status}</span>
                        </td>
                        {activeTab === 'pending' && (
                          <>
                            <td className="px-4 py-3 text-xs text-yellow-600">
                              {inv.gipLastAttempt ? formatDate(inv.gipLastAttempt) : '—'}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {inv.gipJobId ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] text-gray-700 select-all">
                                    {inv.gipJobId}
                                  </span>
                                  <CopyButton text={inv.gipJobId} />
                                  <button
                                    onClick={() => router.push(`/jobs/${inv.gipJobId}`)}
                                    title="Open job detail"
                                    className="text-gray-300 hover:text-indigo-600 transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => router.push(`/trace?invoiceId=${inv.invoice_id}&ssoEnterpriseId=${ssoEnterpriseId}`)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Trace →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {activeTab === 'missing' && missingCount > 500 && (
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                  Showing first 500 of {missingCount} not-received records
                </div>
              )}
              {activeTab === 'failed' && failedCount > 500 && (
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                  Showing first 500 of {failedCount} failed records
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
