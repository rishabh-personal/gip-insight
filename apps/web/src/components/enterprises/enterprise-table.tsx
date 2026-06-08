'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, Fragment } from 'react';
import { getEnterpriseMetrics } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ChevronRight, Star, FlaskConical } from 'lucide-react';

interface EnterpriseTableProps {
  enterprises: any[];
  from: string;
  to: string;
  /** When set, metrics are scoped to this connector only (connector-tab mode). */
  connectorName?: string;
  importantCount?: number;
  isImportant?: (id: string) => boolean;
  isTest?: (id: string) => boolean;
  toggleImportant?: (id: string) => void;
  toggleTest?: (id: string) => void;
  onFailureReport?: (id: string, hasFailed: boolean) => void;
}

function HealthDot({ health }: { health?: string }) {
  if (!health) return <span className="inline-block w-2 h-2 rounded-full bg-gray-200 animate-pulse" />;
  const cls =
    health === 'green'  ? 'bg-green-500' :
    health === 'yellow' ? 'bg-yellow-400' :
                          'bg-red-500';
  return <span className={cn('inline-block w-2 h-2 rounded-full', cls)} />;
}

function Skeleton({ w = 'w-12' }: { w?: string }) {
  return <span className={cn('inline-block h-3.5 rounded bg-gray-100 animate-pulse', w)} />;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${w}%` }} />
    </div>
  );
}

function AppPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
      {name}
    </span>
  );
}

/** Shared metrics fetcher — used by both card and row views */
function useEnterpriseRowData(
  ssoEnterpriseId: string,
  from: string,
  to: string,
  connectorName?: string,
) {
  return useQuery({
    queryKey: ['enterprise-metrics', ssoEnterpriseId, from, to, connectorName ?? ''],
    queryFn: () => getEnterpriseMetrics(ssoEnterpriseId, {
      from, to,
      ...(connectorName ? { connectorName } : {}),
    }),
    staleTime: 60_000,
  });
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function EnterpriseCard({
  enterprise, from, to, connectorName,
  isImportant, isTest, toggleImportant, toggleTest, onFailureReport,
}: {
  enterprise: any; from: string; to: string; connectorName?: string;
  isImportant?: (id: string) => boolean; isTest?: (id: string) => boolean;
  toggleImportant?: (id: string) => void; toggleTest?: (id: string) => void;
  onFailureReport?: (id: string, hasFailed: boolean) => void;
}) {
  const router = useRouter();
  const id = enterprise.ssoEnterpriseId;
  const important = isImportant?.(id);

  const { data, isLoading } = useEnterpriseRowData(id, from, to, connectorName);
  const m = data?.data?.metrics;
  const health = data?.data?.health;
  const hasFailed = (m?.failed ?? 0) > 0;

  useEffect(() => {
    if (!data || !important) return;
    onFailureReport?.(id, hasFailed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFailed, important]);

  const successRate = m?.success_rate ?? 0;
  const rateColor =
    successRate >= 98 ? 'text-green-600' :
    successRate >= 90 ? 'text-yellow-600' :
                        'text-red-600';

  const detailUrl = `/enterprises/${id}?from=${from}&to=${to}${connectorName ? `&connectorName=${encodeURIComponent(connectorName)}` : ''}`;

  return (
    <div
      onClick={() => router.push(detailUrl)}
      className={cn(
        'bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50 transition-colors',
        important && hasFailed && 'border-red-200 bg-red-50',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <HealthDot health={health} />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{enterprise.tradeName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {enterprise.baCode || id?.slice(0, 14) + '…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            title={important ? 'Remove from Important' : 'Mark as Important'}
            onClick={() => toggleImportant?.(id)}
            className={cn('p-1 rounded', important ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400')}
          >
            <Star className={cn('w-3.5 h-3.5', important && 'fill-yellow-400')} />
          </button>
          <button
            title={isTest?.(id) ? 'Remove Test/UAT' : 'Mark as Test/UAT'}
            onClick={() => toggleTest?.(id)}
            className={cn('p-1 rounded', isTest?.(id) ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-400')}
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>

      {/* Apps */}
      {enterprise.apps?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {enterprise.apps.slice(0, 4).map((app: any) => (
            <AppPill key={app._id} name={app.name} />
          ))}
          {enterprise.apps.length > 4 && (
            <span className="text-[10px] text-gray-400">+{enterprise.apps.length - 4}</span>
          )}
        </div>
      )}

      {/* Metrics row */}
      {isLoading ? (
        <div className="flex gap-4">
          <Skeleton w="w-20" /><Skeleton w="w-16" /><Skeleton w="w-16" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">Transactions</p>
            <p className="text-sm font-semibold text-gray-700">{m?.zwing_invoices ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-green-500 mb-0.5">Success</p>
            <p className="text-sm font-semibold text-green-600">{m?.succeeded ?? m?.success ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-red-400 mb-0.5">Failed</p>
            <p className={cn('text-sm font-semibold', hasFailed ? 'text-red-600' : 'text-gray-400')}>
              {m?.failed ?? 0}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">Rate</p>
            <p className={cn('text-sm font-semibold', rateColor)}>{successRate}%</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Desktop table row (unchanged) ────────────────────────────────────────────

function EnterpriseRow({
  enterprise, from, to, connectorName,
  isImportant, isTest, toggleImportant, toggleTest, onFailureReport,
}: {
  enterprise: any; from: string; to: string; connectorName?: string;
  isImportant?: (id: string) => boolean; isTest?: (id: string) => boolean;
  toggleImportant?: (id: string) => void; toggleTest?: (id: string) => void;
  onFailureReport?: (id: string, hasFailed: boolean) => void;
}) {
  const router = useRouter();
  const id = enterprise.ssoEnterpriseId;
  const important = isImportant?.(id);
  const test = isTest?.(id);

  const { data, isLoading } = useEnterpriseRowData(id, from, to, connectorName);
  const m = data?.data?.metrics;
  const health = data?.data?.health;
  const hasFailed = (m?.failed ?? 0) > 0;

  useEffect(() => {
    if (!data || !important) return;
    onFailureReport?.(id, hasFailed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFailed, important]);

  const detailUrl = `/enterprises/${id}?from=${from}&to=${to}${connectorName ? `&connectorName=${encodeURIComponent(connectorName)}` : ''}`;

  return (
    <tr
      onClick={() => router.push(detailUrl)}
      className={cn(
        'cursor-pointer transition-colors',
        important && hasFailed ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50',
      )}
    >
      <td className="px-4 py-3.5"><HealthDot health={health} /></td>
      <td className="px-4 py-3.5">
        <p className="font-medium text-gray-900 text-sm truncate max-w-[160px]">{enterprise.tradeName}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">
          {enterprise.baCode || id?.slice(0, 14) + '…'}
        </p>
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {enterprise.apps?.slice(0, 3).map((app: any) => <AppPill key={app._id} name={app.name} />)}
          {enterprise.apps?.length > 3 && <span className="text-[10px] text-gray-400">+{enterprise.apps.length - 3}</span>}
        </div>
      </td>
      <td className="px-4 py-3.5 text-right hidden md:table-cell">
        {isLoading ? <Skeleton w="w-10" /> : <span className="text-gray-700">{m?.zwing_invoices ?? '—'}</span>}
      </td>
      <td className="px-4 py-3.5 text-right hidden md:table-cell">
        {isLoading ? <Skeleton w="w-8" /> : <span className="text-gray-700">{m?.processed ?? m?.total_jobs ?? 0}</span>}
      </td>
      <td className="px-4 py-3.5 text-right hidden lg:table-cell">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className={(m?.pending ?? 0) > 0 ? 'font-medium text-yellow-600' : 'text-gray-400'}>
            {m?.pending ?? 0}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right hidden lg:table-cell">
        {isLoading ? <Skeleton w="w-8" /> : (m?.missing ?? m?.sync_gap) == null ? (
          <span className="text-gray-400 text-xs">N/A</span>
        ) : (m?.missing ?? m?.sync_gap ?? 0) > 0 ? (
          <span className="font-semibold text-red-600">{m?.missing ?? m?.sync_gap}</span>
        ) : (
          <span className="text-green-600 text-xs">✓ 0</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className="text-green-600">{m?.succeeded ?? m?.success ?? 0}</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className={(m?.failed ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
            {m?.failed ?? 0}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-14" /> : (
          <div className="flex items-center justify-end gap-2">
            <MiniBar
              value={m?.success ?? 0}
              max={m?.total_jobs ?? 0}
              color={
                (m?.success_rate ?? 0) >= 98 ? 'bg-green-400' :
                (m?.success_rate ?? 0) >= 90 ? 'bg-yellow-400' :
                'bg-red-400'
              }
            />
            <span className={cn(
              'text-xs font-medium w-10 text-right',
              (m?.success_rate ?? 0) >= 98 ? 'text-green-600' :
              (m?.success_rate ?? 0) >= 90 ? 'text-yellow-600' : 'text-red-600',
            )}>
              {m?.success_rate ?? 0}%
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            title={important ? 'Remove from Important' : 'Mark as Important'}
            onClick={() => toggleImportant?.(id)}
            className={cn('p-1 rounded transition-colors', important ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-200 hover:text-yellow-400')}
          >
            <Star className={cn('w-3.5 h-3.5', important && 'fill-yellow-400')} />
          </button>
          <button
            title={test ? 'Remove from Test/UAT' : 'Mark as Test/UAT'}
            onClick={() => toggleTest?.(id)}
            className={cn('p-1 rounded transition-colors', test ? 'text-indigo-500 hover:text-indigo-600' : 'text-gray-200 hover:text-indigo-400')}
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300 ml-1" />
        </div>
      </td>
    </tr>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function EnterpriseTable({
  enterprises, from, to, connectorName, importantCount = 0,
  isImportant, isTest, toggleImportant, toggleTest, onFailureReport,
}: EnterpriseTableProps) {
  const sharedProps = { from, to, connectorName, isImportant, isTest, toggleImportant, toggleTest, onFailureReport };

  return (
    <>
      {/* ── Mobile: card list (< md) ── */}
      <div className="md:hidden space-y-2">
        {enterprises.map((e, idx) => (
          <Fragment key={e.ssoEnterpriseId}>
            <EnterpriseCard enterprise={e} {...sharedProps} />
            {importantCount > 0 && idx === importantCount - 1 && idx < enterprises.length - 1 && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pt-1">
                Other enterprises
              </p>
            )}
          </Fragment>
        ))}
      </div>

      {/* ── Tablet / Desktop: table (≥ md) ── */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-8"></th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Enterprise</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Apps</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Transactions Created</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Processed</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Pending</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Not Captured</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Succeeded</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Failed</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Success %</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {enterprises.map((e, idx) => (
              <Fragment key={e.ssoEnterpriseId}>
                <EnterpriseRow enterprise={e} {...sharedProps} />
                {importantCount > 0 && idx === importantCount - 1 && idx < enterprises.length - 1 && (
                  <tr className="bg-gray-50">
                    <td colSpan={11} className="px-4 py-1.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Other enterprises
                      </span>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
