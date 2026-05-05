'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getInvoiceTimeline } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { cn } from '@/lib/utils';
import { PageLoader, ErrorState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Copy, Check,
  Clock, ArrowUpDown, ArrowUp, ArrowDown, Download,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a UTC ISO string as IST for display. */
function toIst(isoUtc: string | null): string {
  if (!isoUtc) return '—';
  return new Date(isoUtc).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Format seconds into a human-readable delay string. */
function formatDelay(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Export an array of timeline rows to a CSV file download. */
function exportCsv(rows: TimelineItem[], filename: string) {
  const headers = [
    'Invoice ID', 'Store ID', 'Transaction Type', 'Transaction Sub Type',
    'Zwing Status', 'Zwing Created At (IST)', 'GIP Status',
    'GIP Synced At (IST)', 'Delay (seconds)', 'Delay (human)',
  ];

  function escapeCell(val: string | number | null | undefined): string {
    const s = val == null ? '' : String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.invoiceId,
        r.storeId,
        r.transactionType,
        r.transactionSubType,
        r.zwingStatus,
        toIst(r.zwingCreatedAt),
        r.gipStatus,
        toIst(r.gipSyncedAt),
        r.delaySeconds,
        formatDelay(r.delaySeconds),
      ]
        .map(escapeCell)
        .join(','),
    ),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tailwind colour class for a delay value. */
function delayColor(seconds: number | null): string {
  if (seconds === null) return 'text-gray-400';
  if (seconds < 300)   return 'text-green-600';
  if (seconds < 1800)  return 'text-yellow-600';
  return 'text-red-600';
}

type GipStatus = 'success' | 'failed' | 'pending' | 'missing';

const STATUS_BADGE: Record<GipStatus, { variant: 'success' | 'danger' | 'warning' | 'muted'; label: string }> = {
  success: { variant: 'success', label: 'Synced' },
  failed:  { variant: 'danger',  label: 'Failed' },
  pending: { variant: 'warning', label: 'Pending' },
  missing: { variant: 'muted',   label: 'Missing' },
};

type SortKey = 'zwingCreatedAt' | 'delaySeconds' | 'gipStatus';
type SortDir = 'asc' | 'desc';

interface TimelineItem {
  invoiceId: string;
  storeId: string | null;
  transactionType: string | null;
  transactionSubType: string | null;
  zwingStatus: string | null;
  zwingCreatedAt: string | null;
  gipStatus: GipStatus;
  gipSyncedAt: string | null;
  delaySeconds: number | null;
  gipJobId: string | null;
}

const PAGE_SIZE = 50;

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoiceTimelineView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { from, to } = useDateRange();

  const connectorId   = searchParams.get('connectorId')   ?? undefined;
  const connectorName = searchParams.get('connectorName') ?? undefined;

  // Filters
  const [statusFilter, setStatusFilter] = useState<GipStatus | 'all'>('all');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('zwingCreatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice-timeline', ssoEnterpriseId, from, to, connectorId],
    queryFn: () => getInvoiceTimeline(ssoEnterpriseId, { from, to, connectorId }),
    staleTime: 60_000,
  });

  const d = data?.data;
  const items: TimelineItem[] = d?.items ?? [];
  const summary = d?.summary ?? {};
  const enterprise = d?.enterprise ?? {};

  // ── Client-side filter + sort ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter((i) => i.gipStatus === statusFilter);
  }, [items, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'zwingCreatedAt') {
        cmp = (a.zwingCreatedAt ?? '').localeCompare(b.zwingCreatedAt ?? '');
      } else if (sortKey === 'delaySeconds') {
        cmp = (a.delaySeconds ?? Infinity) - (b.delaySeconds ?? Infinity);
      } else if (sortKey === 'gipStatus') {
        const order: Record<GipStatus, number> = { missing: 0, failed: 1, pending: 2, success: 3 };
        cmp = order[a.gipStatus] - order[b.gipStatus];
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-indigo-500" />
      : <ArrowDown className="w-3 h-3 text-indigo-500" />;
  }

  if (isLoading) return <PageLoader />;
  if (isError)   return <ErrorState />;

  const avgDelay = summary.avgDelaySeconds != null ? formatDelay(summary.avgDelaySeconds) : '—';
  const p95Delay = summary.p95DelaySeconds != null ? formatDelay(summary.p95DelaySeconds) : '—';

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 hover:text-gray-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium">
          Invoice Timeline — {enterprise.tradeName ?? ssoEnterpriseId}
        </span>
        {connectorName && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            Connector: {connectorName}
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Invoices"  value={d?.total ?? 0}            color="default" sub="from Zwing" />
        <StatCard label="Synced"          value={summary.successCount ?? 0} color="green"   sub="GIP success" />
        <StatCard label="Failed in GIP"   value={summary.failedCount  ?? 0} color={(summary.failedCount  ?? 0) > 0 ? 'red'    : 'default'} sub="all attempts failed" />
        <StatCard label="Pending in GIP"  value={summary.pendingCount ?? 0} color={(summary.pendingCount ?? 0) > 0 ? 'yellow' : 'default'} sub="in-flight" />
        <StatCard label="Not Received"    value={summary.missingCount ?? 0} color={(summary.missingCount ?? 0) > 0 ? 'yellow' : 'default'} sub="no GIP job" />
        <StatCard label="Avg / P95 Delay" value={avgDelay}                  color="default" sub={`p95: ${p95Delay}`} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as GipStatus | 'all'); setPage(1); }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All statuses</option>
          <option value="success">Synced</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="missing">Missing</option>
        </select>

        <span className="text-xs text-gray-400">
          {statusFilter === 'all'
            ? `${items.length.toLocaleString()} invoices`
            : `${filtered.length.toLocaleString()} of ${items.length.toLocaleString()} invoices`}
        </span>

        <button
          onClick={() => {
            const slug = enterprise.tradeName
              ? enterprise.tradeName.replace(/\s+/g, '_').toLowerCase()
              : ssoEnterpriseId;
            const dateSlug = `${from.slice(0, 10)}_to_${to.slice(0, 10)}`;
            exportCsv(sorted, `invoice_timeline_${slug}_${dateSlug}.csv`);
          }}
          disabled={sorted.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
          {sorted.length > 0 && (
            <span className="text-indigo-200 text-xs">({sorted.length.toLocaleString()})</span>
          )}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-gray-500 text-left">
                <th className="px-3 py-2.5 font-medium">Invoice ID</th>
                <th className="px-3 py-2.5 font-medium">Store</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th
                  className="px-3 py-2.5 font-medium cursor-pointer select-none"
                  onClick={() => toggleSort('zwingCreatedAt')}
                >
                  <span className="flex items-center gap-1">
                    Created (IST) <SortIcon k="zwingCreatedAt" />
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 font-medium cursor-pointer select-none"
                  onClick={() => toggleSort('gipStatus')}
                >
                  <span className="flex items-center gap-1">
                    GIP Status <SortIcon k="gipStatus" />
                  </span>
                </th>
                <th className="px-3 py-2.5 font-medium">Synced At (IST)</th>
                <th
                  className="px-3 py-2.5 font-medium cursor-pointer select-none"
                  onClick={() => toggleSort('delaySeconds')}
                >
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Delay <SortIcon k="delaySeconds" />
                  </span>
                </th>
                <th className="px-3 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">
                    No invoices match your filters.
                  </td>
                </tr>
              )}
              {pageItems.map((item) => {
                const sb = STATUS_BADGE[item.gipStatus];
                return (
                  <tr key={item.invoiceId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-2.5">
                      <InvoiceIdCell id={item.invoiceId} ssoEnterpriseId={ssoEnterpriseId} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 font-mono">{item.storeId ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{item.transactionType ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{toIst(item.zwingCreatedAt)}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{toIst(item.gipSyncedAt)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('font-semibold tabular-nums', delayColor(item.delaySeconds))}>
                        {formatDelay(item.delaySeconds)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {item.gipJobId && (
                        <Link
                          href={`/trace?invoiceId=${encodeURIComponent(item.invoiceId)}&ssoEnterpriseId=${encodeURIComponent(ssoEnterpriseId)}`}
                          className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex"
                          title="Trace in GIP"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
            <span className="text-xs text-gray-400">
              Page {safePage} of {totalPages} &middot; {sorted.length.toLocaleString()} rows
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {/* Page number pills — show at most 7 */}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'w-7 h-7 text-xs rounded font-medium',
                      p === safePage
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100',
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timezone note */}
      <p className="text-[11px] text-gray-400 text-center">
        All timestamps displayed in IST (UTC+5:30). Zwing stores dates in IST; GIP stores in UTC — delay is calculated correctly across both.
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InvoiceIdCell({ id, ssoEnterpriseId }: { id: string; ssoEnterpriseId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <span className="flex items-center gap-1 font-mono text-gray-800">
      <span className="select-all truncate max-w-[120px]" title={id}>{id}</span>
      <button
        onClick={copy}
        className="p-0.5 rounded text-gray-300 hover:text-indigo-600 transition-colors shrink-0"
        title="Copy"
      >
        {copied
          ? <Check className="w-3 h-3 text-green-500" />
          : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
}
