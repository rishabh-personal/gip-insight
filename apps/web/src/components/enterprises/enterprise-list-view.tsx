'use client';

import { useQuery } from '@tanstack/react-query';
import { getEnterprises, getEnterpriseConnectors } from '@/lib/api-client';
import { useDateRange } from '@/hooks/use-date-range';
import { useEnterpriseLabels } from '@/hooks/use-enterprise-labels';
import { useEnterpriseViews } from '@/hooks/use-enterprise-views';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { EnterpriseTable } from './enterprise-table';
import { Building2, Layers, Search, Star, FlaskConical, AlertTriangle, Pin, X, Plus } from 'lucide-react';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type SubTab = 'all' | 'attention' | 'important' | 'test';

const CONNECTOR_NAME_KEY = 'gip:active-connector-name';
const SUB_TAB_KEY = 'gip:active-sub-tab';

function loadStr(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveStr(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function EnterpriseListView() {
  const [search, setSearch] = useState('');
  // Store connector name directly — not a view ID. Empty string = "All".
  const [activeConnectorName, setActiveConnectorNameRaw] = useState<string>(
    () => loadStr(CONNECTOR_NAME_KEY, ''),
  );
  const [activeSubTab, setActiveSubTabRaw] = useState<SubTab>(() => loadStr(SUB_TAB_KEY, 'all') as SubTab);

  const setActiveConnectorName = useCallback((name: string) => {
    setActiveConnectorNameRaw(name);
    saveStr(CONNECTOR_NAME_KEY, name);
  }, []);

  const setActiveSubTab = useCallback((tab: SubTab) => {
    setActiveSubTabRaw(tab);
    saveStr(SUB_TAB_KEY, tab);
  }, []);
  const [showConnectorPicker, setShowConnectorPicker] = useState(false);
  const [failedImportantIds, setFailedImportantIds] = useState<Set<string>>(new Set());

  const pickerRef = useRef<HTMLDivElement>(null);

  const { from, to } = useDateRange();
  const { importantIds, testIds, isImportant, isTest, toggleImportant, toggleTest } = useEnterpriseLabels();
  const { views, addView, removeView, isPinned } = useEnterpriseViews();

  // Close connector picker when clicking outside
  useEffect(() => {
    if (!showConnectorPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowConnectorPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showConnectorPicker]);

  const handleFailureReport = useCallback((id: string, hasFailed: boolean) => {
    if (!isImportant(id)) return;
    setFailedImportantIds((prev) => {
      const next = new Set(prev);
      hasFailed ? next.add(id) : next.delete(id);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importantIds]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['enterprise-stubs', search, activeConnectorName],
    queryFn: () => getEnterprises({
      search: search || undefined,
      connectorName: activeConnectorName || undefined,
    }),
    staleTime: 30_000,
  });

  const { data: connectorsData } = useQuery({
    queryKey: ['enterprise-connectors'],
    queryFn: getEnterpriseConnectors,
    staleTime: 300_000,
  });

  const connectors = useMemo(() => connectorsData?.data || [], [connectorsData]);

  // If the active connector tab was removed, fall back to "All"
  useEffect(() => {
    if (!activeConnectorName) return;
    const stillExists = views.some((v) => v.connectorName === activeConnectorName);
    if (!stillExists) setActiveConnectorName('');
  }, [activeConnectorName, views, setActiveConnectorName]);

  const enterprises = useMemo(() => data?.data || [], [data]);

  // Sub-tab badge counts — scoped to the current connector context (already filtered by API)
  const subTabCounts = useMemo(() => ({
    attention: enterprises.filter((e: any) =>
      isImportant(e.ssoEnterpriseId) && failedImportantIds.has(e.ssoEnterpriseId),
    ).length,
    important: enterprises.filter((e: any) => isImportant(e.ssoEnterpriseId)).length,
    test:      enterprises.filter((e: any) => isTest(e.ssoEnterpriseId)).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [enterprises, importantIds, testIds, failedImportantIds]);

  // Final visible list: apply sub-tab filter on top of the server-filtered enterprise list
  const { visibleEnterprises, importantCount } = useMemo(() => {
    if (activeSubTab === 'attention') {
      return {
        visibleEnterprises: enterprises.filter((e: any) =>
          isImportant(e.ssoEnterpriseId) && failedImportantIds.has(e.ssoEnterpriseId),
        ),
        importantCount: 0,
      };
    }
    if (activeSubTab === 'important') {
      return {
        visibleEnterprises: enterprises.filter((e: any) => isImportant(e.ssoEnterpriseId)),
        importantCount: 0,
      };
    }
    if (activeSubTab === 'test') {
      return {
        visibleEnterprises: enterprises.filter((e: any) => isTest(e.ssoEnterpriseId)),
        importantCount: 0,
      };
    }
    // 'all': exclude test, sort important to top
    const nonTest = enterprises.filter((e: any) => !isTest(e.ssoEnterpriseId));
    const imp  = nonTest.filter((e: any) =>  isImportant(e.ssoEnterpriseId));
    const rest = nonTest.filter((e: any) => !isImportant(e.ssoEnterpriseId));
    return { visibleEnterprises: [...imp, ...rest], importantCount: imp.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterprises, activeSubTab, importantIds, testIds, failedImportantIds]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState message={(error as any)?.message || 'Failed to load enterprises'} />;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Enterprises</h2>
        <p className="text-sm text-gray-500 mt-1">
          Active integrations — metrics load per row
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Enterprises" value={enterprises.length} icon={Building2} color="default" />
        <StatCard label="Connectors" value={connectors.length} icon={Layers} color="default" sub="across all" />
      </div>

      {/* ── Tab group: connector context (row 1) + sub-tabs (row 2) ── */}
      <div className="space-y-0">
      {/* Row 1: connector context — horizontally scrollable on mobile */}
      <div className="flex items-center border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => { setActiveConnectorName(''); setActiveSubTab('all'); }}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
            !activeConnectorName
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          All
        </button>

        {views.map((view) => (
          <div key={view.id} className="flex items-center -mb-px">
            <button
              onClick={() => { setActiveConnectorName(view.connectorName); setActiveSubTab('all'); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeConnectorName === view.connectorName
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Pin className="w-3 h-3 shrink-0" />
              {view.label}
            </button>
            <button
              onClick={() => {
                if (activeConnectorName === view.connectorName) setActiveConnectorName('');
                removeView(view.id);
              }}
              title="Remove connector tab"
              className="text-gray-300 hover:text-red-400 pr-1 -ml-1 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Add connector tab picker */}
        <div ref={pickerRef} className="relative ml-2 mb-px">
          <button
            onClick={() => setShowConnectorPicker((v) => !v)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
              showConnectorPicker
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-50',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Add tab
          </button>

          {showConnectorPicker && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 w-56 py-1 max-h-72 overflow-y-auto">
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Pin connector as tab
              </p>
              {connectors.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2">No connectors found</p>
              ) : (
                connectors.map((c: any) => {
                  const pinned = isPinned(c.name);
                  return (
                    <button
                      key={c.name}
                      disabled={pinned}
                      onClick={() => {
                        addView(c.name);
                        setActiveConnectorName(c.name);
                        setActiveSubTab('all');
                        setShowConnectorPicker(false);
                      }}
                      className={cn(
                        'w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                        pinned
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700',
                      )}
                    >
                      <Pin className={cn('w-3 h-3 shrink-0', pinned ? 'text-gray-300' : 'text-gray-400')} />
                      <span className="truncate">{c.name}</span>
                      {pinned && <span className="ml-auto text-[10px] text-gray-400">pinned</span>}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: sub-tabs scoped to active connector — scrollable on mobile */}
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50/50 overflow-x-auto scrollbar-hide">
        {([
          { key: 'all',       label: 'All',            icon: null },
          { key: 'attention', label: 'Needs Attention', icon: AlertTriangle },
          { key: 'important', label: 'Important',       icon: Star },
          { key: 'test',      label: 'Test / UAT',      icon: FlaskConical },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSubTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeSubTab === key
                ? key === 'attention' ? 'border-red-500 text-red-600' : 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
            {key !== 'all' && subTabCounts[key] > 0 && (
              <span className={cn(
                'ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                activeSubTab === key && key === 'attention' ? 'bg-red-100 text-red-700' :
                activeSubTab === key ? 'bg-indigo-100 text-indigo-700' :
                key === 'attention' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500',
              )}>
                {subTabCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>
      </div>{/* end tab group */}

      {/* Search + count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search enterprise…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-full sm:w-56"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
          {visibleEnterprises.length} enterprise{visibleEnterprises.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {visibleEnterprises.length === 0 ? (
        <EmptyState message={
          activeSubTab === 'attention' ? 'No important enterprises with failures — all looking good!' :
          activeSubTab === 'important' ? 'No important enterprises — star one from the All tab' :
          activeSubTab === 'test'      ? 'No Test/UAT enterprises marked yet' :
          activeConnectorName ? `No enterprises found for connector "${activeConnectorName}"` :
          'No enterprises with active app integrations found'
        } />
      ) : (
        <EnterpriseTable
          enterprises={visibleEnterprises}
          from={from}
          to={to}
          importantCount={importantCount}
          isImportant={isImportant}
          isTest={isTest}
          toggleImportant={toggleImportant}
          toggleTest={toggleTest}
          onFailureReport={handleFailureReport}
        />
      )}
    </div>
  );
}
