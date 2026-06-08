'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getEnterprise } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { cn } from '@/lib/utils';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight, ChevronDown, ChevronUp, AlertCircle, Activity, ArrowLeft, GitBranch, Database,
  Copy, Check, ExternalLink, CheckCircle2, Clock, BarChart2, Zap, MoreVertical,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        } catch { /* ignore */ }
      }}
      className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
    >
      {ok ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── Per-event kebab action menu ──────────────────────────────────────────────

function EventActionMenu({
  ssoEnterpriseId,
  connectorId,
  connectorName,
  eventCode,
  eventLabel,
  from,
  to,
  succeeded,
  failed,
}: {
  ssoEnterpriseId: string;
  connectorId: string;
  connectorName: string;
  eventCode: string;
  eventLabel: string;
  from: string;
  to: string;
  succeeded: number;
  failed: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const enc = encodeURIComponent;
  const base = `/enterprises/${ssoEnterpriseId}`;
  const logsBase = `${base}/logs?connectorId=${connectorId}&connectorName=${enc(connectorName)}&eventCode=${enc(eventCode)}&from=${from}&to=${to}`;

  const items = [
    {
      label: 'Timeline',
      href: `${base}/invoice-timeline?connectorId=${connectorId}&connectorName=${enc(connectorName)}&eventCode=${enc(eventCode)}&eventLabel=${enc(eventLabel)}&from=${from}&to=${to}`,
      icon: Clock,
      colorClass: 'text-purple-600',
    },
    {
      label: 'Sync Gap',
      href: `${base}/sync-gap?connectorId=${connectorId}&connectorName=${enc(connectorName)}&eventCode=${enc(eventCode)}&from=${from}&to=${to}`,
      icon: BarChart2,
      colorClass: 'text-indigo-600',
    },
    {
      label: 'All Logs',
      href: `${logsBase}&status=all`,
      icon: Activity,
      colorClass: 'text-gray-600',
    },
    ...(succeeded > 0 ? [{
      label: 'Success Logs',
      href: `${logsBase}&status=success`,
      icon: CheckCircle2,
      colorClass: 'text-green-600',
    }] : []),
    ...(failed > 0 ? [{
      label: 'Failure Logs',
      href: `${logsBase}&status=failed`,
      icon: AlertCircle,
      colorClass: 'text-red-600',
    }] : []),
  ];

  return (
    <div className="flex justify-end">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          'p-1.5 rounded transition-colors',
          open ? 'bg-gray-100 text-gray-700' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-50',
        )}
        title="Actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 50 }}
          className="bg-white rounded-lg border border-gray-200 py-1 min-w-[152px]"
        >
          {items.map(({ label, href, icon: Icon, colorClass }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors',
                colorClass,
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Enterprise header card — shared between both views
function EnterpriseHeaderCard({
  enterprise,
  ssoEnterpriseId,
  from,
  to,
}: {
  enterprise: any;
  ssoEnterpriseId: string;
  from: string;
  to: string;
}) {
  return (
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
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function EnterpriseDetailView({ ssoEnterpriseId }: { ssoEnterpriseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { from, to } = useDateRange();

  const connectorName = searchParams.get('connectorName') || undefined;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise-detail', ssoEnterpriseId, from, to, connectorName ?? ''],
    queryFn: () => getEnterprise(ssoEnterpriseId, { from, to, ...(connectorName ? { connectorName } : {}) }),
  });

  // Must be declared before any conditional returns — Rules of Hooks
  const [missingOpen, setMissingOpen] = useState(false);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  const enterprise = data?.data?.enterprise;
  const connectors: any[] = data?.data?.connectors || [];

  const goToConnector = (name: string) =>
    router.push(`/enterprises/${ssoEnterpriseId}?from=${from}&to=${to}&connectorName=${encodeURIComponent(name)}`);

  // ── No connector selected: show picker ──────────────────────────────────────
  if (!connectorName) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
          <button onClick={() => router.push('/enterprises')} className="flex items-center gap-1 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" /> Enterprises
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">{enterprise?.tradeName}</span>
        </div>

        <EnterpriseHeaderCard enterprise={enterprise} ssoEnterpriseId={ssoEnterpriseId} from={from} to={to} />

        {/* Connector picker */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Select a connector</h3>
          <p className="text-xs text-gray-400 mb-3">
            Choose a connector to view event-wise transaction details for this enterprise.
          </p>
          {connectors.length === 0 ? (
            <EmptyState message="No connectors configured for this enterprise" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {connectors.map((c: any) => {
                const isDeleted = !!c.deletedOn;
                const statusBadge = isDeleted ? 'danger' : c.isEnabled ? 'success' : 'warning';
                const statusLabel = isDeleted ? 'Deleted' : c.isEnabled ? 'Active' : 'Disabled';
                const configuredCount = (c.mappings || []).filter((mp: any) => mp.metrics?.sourceConfigured).length;
                return (
                  <button
                    key={c._id}
                    onClick={() => goToConnector(c.name)}
                    className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm group-hover:text-indigo-700">{c.name}</p>
                          <Badge variant={statusBadge}>{statusLabel}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {c.outboundApp?.name || 'Unknown'} → {c.inboundApp?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {configuredCount > 0
                            ? `${configuredCount} configured event${configuredCount !== 1 ? 's' : ''}`
                            : 'No configured event sources'}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 shrink-0 mt-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Connector selected: event-wise view ─────────────────────────────────────
  const connector = connectors[0];
  if (!connector) {
    return <ErrorState message={`Connector "${connectorName}" not found for this enterprise`} />;
  }

  // Only show events whose outbound eventCode is in EVENT_SOURCE_CONFIGS
  // The backend marks these with sourceConfigured = true
  const configuredMappings: any[] = (connector.mappings || []).filter(
    (mp: any) => mp.metrics?.sourceConfigured === true,
  );

  // Compute summary totals from configured-event mappings only
  const totalTransactions = configuredMappings.reduce((s, mp) => s + (mp.metrics?.sourceCount ?? 0), 0);
  const totalSucceeded   = configuredMappings.reduce((s, mp) => s + (mp.metrics?.succeeded  ?? 0), 0);
  const totalFailed      = configuredMappings.reduce((s, mp) => s + (mp.metrics?.failed     ?? 0), 0);
  const totalPending     = configuredMappings.reduce((s, mp) => s + (mp.metrics?.pending    ?? 0), 0);
  const totalMissing     = configuredMappings.reduce((s, mp) => s + (mp.metrics?.missing    ?? 0), 0);
  const totalProcessed   = totalSucceeded + totalFailed;
  const successRate      = totalProcessed > 0 ? Math.round((totalSucceeded / totalProcessed) * 100) : 0;

  const m = connector.metrics || {};
  const missingList: string[] = m.missingRefDocNos ?? [];
  const missingTruncated = !!m.missingRefDocNosTruncated;

  const isDeleted = !!connector.deletedOn;
  const statusBadge = isDeleted ? 'danger' : connector.isEnabled ? 'success' : 'warning';
  const statusLabel = isDeleted ? 'Deleted' : connector.isEnabled ? 'Active' : 'Disabled';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <button onClick={() => router.push('/enterprises')} className="flex items-center gap-1 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" /> Enterprises
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <button
          onClick={() => router.push(`/enterprises/${ssoEnterpriseId}?from=${from}&to=${to}`)}
          className="hover:text-gray-700"
        >
          {enterprise?.tradeName}
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700">
          <Zap className="w-3 h-3" />
          {connectorName}
        </span>
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
          {/* Connector status pill + app info */}
          <div className="shrink-0 text-right space-y-1">
            <Badge variant={statusBadge}>{statusLabel}</Badge>
            <p className="text-xs text-gray-500">
              {connector.outboundApp?.name || 'Unknown'} → {connector.inboundApp?.name || 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* Summary stat cards — aggregated across configured events only */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Transactions Created"
          value={totalTransactions.toLocaleString()}
          color="default"
          sub="source records (Zwing)"
        />
        <StatCard
          label="Succeeded"
          value={totalSucceeded}
          color={totalSucceeded > 0 ? 'green' : 'default'}
          sub="delivered successfully"
        />
        <StatCard
          label="Failed"
          value={totalFailed}
          color={totalFailed > 0 ? 'red' : 'default'}
          sub="at least one failure"
        />
        <StatCard
          label="Pending"
          value={totalPending}
          color={totalPending > 0 ? 'yellow' : 'default'}
          sub="GIP job in-flight"
        />
        <StatCard
          label="Not Captured"
          value={totalMissing}
          color={totalMissing > 0 ? 'yellow' : 'default'}
          sub="no GIP job found"
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          color={successRate >= 98 ? 'green' : successRate >= 90 ? 'yellow' : 'red'}
          sub="of processed events"
        />
      </div>

      {/* Event-wise breakdown table — only events in EVENT_SOURCE_CONFIGS (sourceConfigured = true) */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Event Breakdown</h3>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Zap className="w-3 h-3 text-indigo-400" />
            <span className="text-indigo-600 font-medium">{connectorName}</span>
          </div>
        </div>

        {configuredMappings.length === 0 ? (
          <div className="p-6">
            <EmptyState message="No configured event sources for this connector — add events to EVENT_SOURCE_CONFIGS to track them here" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
                    Transactions Created
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Processed</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Pending</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Not Captured</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Succeeded</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Failed</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Success %</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-right w-10">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {configuredMappings.map((mp: any) => {
                  const em = mp.metrics;
                  const processed = (em?.succeeded ?? 0) + (em?.failed ?? 0);
                  const rate = em?.success_rate ?? 0;
                  return (
                    <tr key={mp._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-gray-900">
                            {em?.sourceLabel || mp.outboundEvent?.eventCode || '—'}
                          </p>
                          <p className="text-[10px] font-mono text-gray-400 truncate max-w-[200px]">
                            {mp.outboundEvent?.eventCode}
                          </p>
                          {!mp.isEnabled && (
                            <span className="inline-block text-[10px] px-1.5 py-0.5 bg-yellow-50 text-yellow-600 rounded font-medium">
                              Disabled
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-700">
                          {em?.sourceCount != null ? em.sourceCount.toLocaleString() : (
                            <span className="text-yellow-400 text-xs" title="MySQL query failed">err</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-600">{processed}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-medium', (em?.pending ?? 0) > 0 ? 'text-yellow-600' : 'text-gray-400')}>
                          {em?.pending ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {em?.missing != null ? (
                          <span className={cn('font-medium', em.missing > 0 ? 'text-slate-600' : 'text-gray-300')}>
                            {em.missing}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-medium', (em?.succeeded ?? 0) > 0 ? 'text-green-600' : 'text-gray-400')}>
                          {em?.succeeded ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-medium', (em?.failed ?? 0) > 0 ? 'text-red-600' : 'text-gray-400')}>
                          {em?.failed ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-semibold',
                          rate >= 98 ? 'text-green-600' : rate >= 90 ? 'text-yellow-600' : 'text-red-600',
                        )}>
                          {rate}%
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <EventActionMenu
                          ssoEnterpriseId={ssoEnterpriseId}
                          connectorId={connector._id}
                          connectorName={connector.name}
                          eventCode={mp.outboundEvent?.eventCode ?? ''}
                          eventLabel={em?.sourceLabel ?? mp.outboundEvent?.eventCode ?? ''}
                          from={from}
                          to={to}
                          succeeded={em?.succeeded ?? 0}
                          failed={em?.failed ?? 0}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Total footer row — only when multiple configured events */}
              {configuredMappings.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-700">
                      {totalTransactions.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">{totalProcessed}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-yellow-600">{totalPending || <span className="text-gray-300">0</span>}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">{totalMissing || <span className="text-gray-300">0</span>}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-green-600">{totalSucceeded}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-600">{totalFailed || <span className="text-gray-300">0</span>}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold">
                      <span className={cn(
                        successRate >= 98 ? 'text-green-600' : successRate >= 90 ? 'text-yellow-600' : 'text-red-600',
                      )}>
                        {successRate}%
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <p className="px-4 pb-3 text-[10px] text-gray-400">
          Only events configured in EVENT_SOURCE_CONFIGS are shown. Transactions = source count from Zwing.
          Not Captured = Transactions − (Succeeded + Failed + Pending).
        </p>
      </div>

      {/* Missing invoice IDs (connector-level) */}
      {(m.missing ?? 0) > 0 && missingList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-slate-700">
              Records in Zwing with no GIP job
              {missingTruncated && (
                <span className="text-slate-500 font-normal ml-1 text-xs">
                  (showing first {missingList.length} of {m.missing})
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <CopyIconButton text={missingList.join('\n')} title="Copy all IDs" />
              <span className="text-[10px] text-slate-400">copy all</span>
              <button
                type="button"
                onClick={() => setMissingOpen((o) => !o)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
              >
                {missingOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {missingOpen && (
            <ul className="max-h-48 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-800 border border-slate-100 rounded-lg p-2 bg-slate-50/60">
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
          )}
        </div>
      )}

      {/* Quick action links for the selected connector */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/enterprises/${ssoEnterpriseId}/logs?connectorId=${connector._id}&connectorName=${encodeURIComponent(connector.name)}&status=all&from=${from}&to=${to}`}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-700 font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          All Logs
        </Link>
        {(m.succeeded ?? 0) > 0 && (
          <Link
            href={`/enterprises/${ssoEnterpriseId}/logs?connectorId=${connector._id}&connectorName=${encodeURIComponent(connector.name)}&status=success&from=${from}&to=${to}`}
            className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-800 font-medium px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-50 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Success Logs
          </Link>
        )}
        {(m.failed ?? 0) > 0 && (
          <Link
            href={`/enterprises/${ssoEnterpriseId}/logs?connectorId=${connector._id}&connectorName=${encodeURIComponent(connector.name)}&status=failed&from=${from}&to=${to}`}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Failure Logs
          </Link>
        )}
        <Link
          href={`/enterprises/${ssoEnterpriseId}/sync-gap?connectorId=${connector._id}&connectorName=${encodeURIComponent(connector.name)}&from=${from}&to=${to}`}
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Sync Gap
        </Link>
      </div>
    </div>
  );
}
