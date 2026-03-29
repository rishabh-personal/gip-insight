'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getEnterpriseMetrics } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface EnterpriseTableProps {
  enterprises: any[];
  from: string;
  to: string;
}

function HealthDot({ health }: { health?: string }) {
  if (!health) return <span className="inline-block w-2 h-2 rounded-full bg-gray-200 animate-pulse" />;
  const cls =
    health === 'green' ? 'bg-green-500' :
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

/** One row — fetches its own metrics independently */
function EnterpriseRow({
  enterprise,
  from,
  to,
}: {
  enterprise: any;
  from: string;
  to: string;
}) {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['enterprise-metrics', enterprise.ssoEnterpriseId, from, to],
    queryFn: () => getEnterpriseMetrics(enterprise.ssoEnterpriseId, { from, to }),
    staleTime: 60_000,
  });

  const m = data?.data?.metrics;
  const health = data?.data?.health;

  return (
    <tr
      onClick={() => router.push(`/enterprises/${enterprise.ssoEnterpriseId}?from=${from}&to=${to}`)}
      className="cursor-pointer hover:bg-gray-50 transition-colors"
    >
      {/* Health dot */}
      <td className="px-4 py-3.5">
        <HealthDot health={health} />
      </td>

      {/* Enterprise name */}
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
          {enterprise.apps?.slice(0, 3).map((app: any) => (
            <AppPill key={app._id} name={app.name} />
          ))}
          {enterprise.apps?.length > 3 && (
            <span className="text-[10px] text-gray-400">+{enterprise.apps.length - 3}</span>
          )}
        </div>
      </td>

      {/* Zwing Invoices */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-10" /> : (
          <span className="text-gray-700">{m?.zwing_invoices ?? '—'}</span>
        )}
      </td>

      {/* Processed (invoices GIP attempted) */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className="text-gray-700">{m?.processed ?? m?.total_jobs ?? 0}</span>
        )}
      </td>

      {/* Pending (GIP job in-flight, not yet success or failed) */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className={(m?.pending ?? 0) > 0 ? 'font-medium text-yellow-600' : 'text-gray-400'}>
            {m?.pending ?? 0}
          </span>
        )}
      </td>

      {/* Not Captured (no GIP job found at all) */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (m?.missing ?? m?.sync_gap) == null ? (
          <span className="text-gray-400 text-xs">N/A</span>
        ) : (m?.missing ?? m?.sync_gap ?? 0) > 0 ? (
          <span className="font-semibold text-red-600">{m?.missing ?? m?.sync_gap}</span>
        ) : (
          <span className="text-green-600 text-xs">✓ 0</span>
        )}
      </td>

      {/* Succeeded invoices */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className="text-green-600">{m?.succeeded ?? m?.success ?? 0}</span>
        )}
      </td>

      {/* Failed invoices */}
      <td className="px-4 py-3.5 text-right">
        {isLoading ? <Skeleton w="w-8" /> : (
          <span className={(m?.failed ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
            {m?.failed ?? 0}
          </span>
        )}
      </td>

      {/* Success % */}
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
              (m?.success_rate ?? 0) >= 90 ? 'text-yellow-600' :
              'text-red-600',
            )}>
              {m?.success_rate ?? 0}%
            </span>
          </div>
        )}
      </td>

      <td className="px-3 py-3.5">
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </td>
    </tr>
  );
}

export function EnterpriseTable({ enterprises, from, to }: EnterpriseTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-8"></th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Enterprise</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Apps</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Zwing Invoices</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Processed</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Not Captured</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Succeeded</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Failed</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Success %</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {enterprises.map((e) => (
            <EnterpriseRow key={e.ssoEnterpriseId} enterprise={e} from={from} to={to} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
