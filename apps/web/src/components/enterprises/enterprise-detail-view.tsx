'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getEnterprise } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight, ChevronDown, ChevronUp, AlertCircle, Activity, ArrowLeft, GitBranch, Database,
  Copy, Check, ExternalLink, CheckCircle2, Clock, BarChart2,
} from 'lucide-react';

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
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/enterprises/${ssoEnterpriseId}/sync-gap?from=${from}&to=${to}`}
              className="flex items-center gap-1.5 text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Sync Gap</span>
            </Link>
            <span className="text-gray-200">|</span>
            <Link
              href={`/enterprises/${ssoEnterpriseId}/invoice-timeline?from=${from}&to=${to}`}
              className="flex items-center gap-1.5 text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Invoice Timeline</span>
              <span className="sm:hidden">Timeline</span>
            </Link>
          </div>
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
                ssoEnterpriseId={ssoEnterpriseId}
                from={from}
                to={to}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyIconButton({ text, title }: { text: string; title?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title={title || 'Copy'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
    >
      {ok ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Connector Card ────────────────────────────────────────────────────────────

function ConnectorCard({
  connector: c,
  ssoEnterpriseId,
  from,
  to,
}: {
  connector: any;
  ssoEnterpriseId: string;
  from: string;
  to: string;
}) {
  const m = c.metrics || {};
  const missingList: string[] = m.missingRefDocNos ?? [];
  const missingTruncated = !!m.missingRefDocNosTruncated;
  const [missingOpen, setMissingOpen] = useState(
    () => (m.missing ?? 0) > 0 && (m.missing ?? 0) <= 20,
  );

  const isDeleted = !!c.deletedOn;
  const statusBadge = isDeleted ? 'danger' : c.isEnabled ? 'success' : 'warning';
  const statusLabel = isDeleted ? 'Deleted' : c.isEnabled ? 'Active' : 'Disabled';

  const hasEventMetrics = c.mappings?.some((mp: any) => mp.metrics !== null);
  const hasSourceConfig  = c.mappings?.some((mp: any) => mp.metrics?.sourceConfigured);

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
        <div className="flex items-center gap-2 shrink-0">
          {(m.missing ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => missingList.length > 0 && setMissingOpen((o) => !o)}
              disabled={missingList.length === 0}
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                missingList.length > 0
                  ? 'text-slate-600 hover:text-slate-800'
                  : 'text-slate-300 cursor-not-allowed',
              )}
            >
              {missingOpen && missingList.length > 0 ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Missing IDs</span>
              <span className="sm:hidden">Miss</span>
            </button>
          )}
          {/* Log buttons: All · Success · Failures · Sync Gap */}
          <div className="flex items-center gap-1">
            <Link
              href={`/enterprises/${ssoEnterpriseId}/logs?connectorId=${c._id}&connectorName=${encodeURIComponent(c.name)}&status=all&from=${from}&to=${to}`}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-700 font-medium px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
              title="All logs"
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">All</span>
            </Link>
            {(m.succeeded ?? 0) > 0 && (
              <Link
                href={`/enterprises/${ssoEnterpriseId}/logs?connectorId=${c._id}&connectorName=${encodeURIComponent(c.name)}&status=success&from=${from}&to=${to}`}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium px-1.5 py-0.5 rounded hover:bg-green-50 transition-colors"
                title="Success logs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Success</span>
              </Link>
            )}
            {(m.failed ?? 0) > 0 && (
              <Link
                href={`/enterprises/${ssoEnterpriseId}/logs?connectorId=${c._id}&connectorName=${encodeURIComponent(c.name)}&status=failed&from=${from}&to=${to}`}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                title="Failure logs"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Failures</span>
              </Link>
            )}
            <Link
              href={`/enterprises/${ssoEnterpriseId}/sync-gap?connectorId=${c._id}&connectorName=${encodeURIComponent(c.name)}&from=${from}&to=${to}`}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
              title="Sync Gap for this connector"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sync Gap</span>
            </Link>
            <Link
              href={`/enterprises/${ssoEnterpriseId}/invoice-timeline?connectorId=${c._id}&connectorName=${encodeURIComponent(c.name)}&from=${from}&to=${to}`}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors"
              title="Invoice Timeline for this connector"
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Timeline</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Connector-level summary — incl. missing = Zwing invoices with no GIP job for this connector */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center mb-1">
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
          <p className="text-[10px] text-slate-400 mb-0.5">Missing</p>
          <p
            className={cn(
              'text-sm font-semibold',
              (m.missing ?? 0) > 0 ? 'text-slate-600' : 'text-gray-300',
            )}
            title="In Zwing window but no DipJob for this connector"
          >
            {m.missing ?? 0}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
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

      {(m.missing ?? 0) > 0 && missingList.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {m.missing} invoice(s) have no DipJob for this connector; ID list unavailable (reload or update API).
        </p>
      )}

      {/* Missing invoice IDs for this connector (Zwing row, no DipJob here) */}
      {(m.missing ?? 0) > 0 && missingList.length > 0 && missingOpen && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-slate-700">
              Invoices in Zwing with no GIP job for this connector
              {missingTruncated && (
                <span className="text-slate-500 font-normal ml-1">
                  (showing first {missingList.length} of {m.missing})
                </span>
              )}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <CopyIconButton text={missingList.join('\n')} title="Copy all IDs" />
              <span className="text-[10px] text-slate-400">copy all</span>
            </div>
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-800">
            {missingList.map((id) => (
              <li key={id} className="flex items-center gap-1.5 py-0.5 border-b border-slate-100/80 last:border-0">
                <span className="flex-1 min-w-0 truncate select-all" title={id}>{id}</span>
                <CopyIconButton text={id} title="Copy" />
                <Link
                  href={`/trace?invoiceId=${encodeURIComponent(id)}&ssoEnterpriseId=${encodeURIComponent(ssoEnterpriseId)}`}
                  className="p-1 rounded text-gray-400 hover:text-indigo-600"
                  title="Trace invoice"
                >
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Event-wise breakdown table — horizontally scrollable */}
      {c.mappings?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-xs min-w-[580px]">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pb-1.5 font-medium">Event</th>
                {hasSourceConfig && (
                  <th className="pb-1.5 font-medium text-right pr-3" title="Source transaction count from Zwing">Src</th>
                )}
                <th className="pb-1.5 font-medium text-right pr-3">OK</th>
                <th className="pb-1.5 font-medium text-right pr-3">Fail</th>
                <th className="pb-1.5 font-medium text-right pr-3">Pend</th>
                <th className="pb-1.5 font-medium text-right pr-3">Miss</th>
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
                    {/* Source count — only render column when at least one event has config */}
                    {hasSourceConfig && (
                      <td className="py-1.5 pr-3 text-right">
                        {em?.sourceConfigured ? (
                          em.sourceCount != null ? (
                            <span className="font-medium text-gray-600">{em.sourceCount.toLocaleString()}</span>
                          ) : (
                            <span className="text-yellow-400 text-[10px]" title="MySQL query failed">err</span>
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-1.5 pr-3 text-right">
                      {em ? <span className={cn('font-medium', em.succeeded > 0 ? 'text-green-600' : 'text-gray-400')}>{em.succeeded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {em ? <span className={cn('font-medium', em.failed > 0 ? 'text-red-600' : 'text-gray-400')}>{em.failed}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {em ? <span className={cn('font-medium', em.pending > 0 ? 'text-yellow-600' : 'text-gray-400')}>{em.pending}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {em && em.missing != null ? (
                        <span
                          className={cn('font-medium', em.missing > 0 ? 'text-slate-600' : 'text-gray-300')}
                          title={em.sourceConfigured ? `Source: ${em.sourceCount} transactions` : 'Based on Zwing invoice count'}
                        >
                          {em.missing}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
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
                          : (em?.missing ?? 0) > 0
                            ? <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">Miss</span>
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
          {hasSourceConfig && (
            <p className="text-[10px] text-gray-400 mt-1">
              Src = source transaction count from Zwing. Miss = Src − (OK + Fail + Pend).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
