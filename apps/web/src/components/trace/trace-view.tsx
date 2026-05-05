'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { traceInvoice, getEnterprises } from '@/lib/api-client';
import { formatDate, cn } from '@/lib/utils';
import { PageLoader, EmptyState } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  Search, CheckCircle2, XCircle, AlertTriangle, Clock,
  Database, Zap, Package, ChevronDown, X,
} from 'lucide-react';

const pipelineColors = {
  SYNCED: 'text-green-700 bg-green-50 border-green-200',
  PARTIAL: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  NOT_SYNCED: 'text-red-700 bg-red-50 border-red-200',
  PENDING: 'text-blue-700 bg-blue-50 border-blue-200',
};

const pipelineIcons = {
  SYNCED: CheckCircle2,
  PARTIAL: AlertTriangle,
  NOT_SYNCED: XCircle,
  PENDING: Clock,
};

export function TraceView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [invoiceId, setInvoiceId] = useState(searchParams.get('invoiceId') || '');
  // Selected enterprise SSO ID (used for the API call)
  const [enterpriseId, setEnterpriseId] = useState(searchParams.get('ssoEnterpriseId') || '');
  // Display name of the selected enterprise (shown in the combobox input)
  const [enterpriseName, setEnterpriseName] = useState('');
  // Text typed into the combobox search input
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Fetch all enterprises (no metrics — fast stub list)
  const { data: enterprisesData } = useQuery({
    queryKey: ['enterprises-list'],
    queryFn: () => getEnterprises(),
    staleTime: 5 * 60_000,
  });
  const allEnterprises: any[] = useMemo(
    () => enterprisesData?.data ?? [],
    [enterprisesData],
  );

  // If the page was opened with a ?ssoEnterpriseId param, pre-fill the name
  useEffect(() => {
    const paramId = searchParams.get('ssoEnterpriseId');
    if (paramId && allEnterprises.length > 0 && !enterpriseName) {
      const match = allEnterprises.find((e) => e.ssoEnterpriseId === paramId);
      if (match) setEnterpriseName(match.tradeName || match.legalName || paramId);
    }
  }, [allEnterprises, searchParams, enterpriseName]);

  // Filter enterprises by what the user typed
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return allEnterprises.slice(0, 50);
    return allEnterprises
      .filter(
        (e) =>
          e.tradeName?.toLowerCase().includes(q) ||
          e.legalName?.toLowerCase().includes(q) ||
          e.ssoEnterpriseId?.toLowerCase().includes(q) ||
          e.baCode?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [allEnterprises, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function selectEnterprise(e: any) {
    setEnterpriseId(e.ssoEnterpriseId);
    setEnterpriseName(e.tradeName || e.legalName || e.ssoEnterpriseId);
    setSearch('');
    setDropdownOpen(false);
  }

  function clearEnterprise() {
    setEnterpriseId('');
    setEnterpriseName('');
    setSearch('');
  }

  const traceMutation = useMutation({
    mutationFn: () => traceInvoice(invoiceId.trim(), enterpriseId.trim() || undefined),
  });

  const handleSearch = () => {
    if (!invoiceId.trim()) return;
    traceMutation.mutate();
  };

  const result = traceMutation.data?.data;
  const PipelineIcon = result ? (pipelineIcons[result.pipelineStatus as keyof typeof pipelineIcons] || Clock) : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Invoice Trace</h2>
        <p className="text-sm text-gray-500 mt-1">
          Track an invoice end-to-end: Zwing → Debezium → GIP → App
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex gap-3 flex-wrap sm:flex-nowrap">

          {/* Invoice ID */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Invoice ID</label>
            <input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. CLPA010125263285"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
            />
          </div>

          {/* Enterprise combobox */}
          <div className="w-full sm:w-72" ref={comboboxRef}>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Enterprise <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              {/* Trigger button */}
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen((o) => !o);
                  setSearch('');
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border rounded-lg transition-colors text-left',
                  dropdownOpen
                    ? 'border-indigo-400 ring-2 ring-indigo-200'
                    : 'border-gray-200 hover:border-gray-300',
                  enterpriseId ? 'text-gray-900' : 'text-gray-400',
                )}
              >
                <span className="truncate">
                  {enterpriseName || 'Select enterprise…'}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {enterpriseId && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); clearEnterprise(); }}
                      className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', dropdownOpen && 'rotate-180')} />
                </span>
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {/* Search box */}
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search by name or ID…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                    </div>
                  </div>

                  {/* Options list */}
                  <ul className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                    {filtered.length === 0 && (
                      <li className="px-3 py-4 text-sm text-gray-400 text-center">No enterprises found</li>
                    )}
                    {filtered.map((e) => (
                      <li
                        key={e.ssoEnterpriseId}
                        onClick={() => selectEnterprise(e)}
                        className={cn(
                          'flex items-start justify-between gap-2 px-3 py-2.5 cursor-pointer hover:bg-indigo-50 transition-colors',
                          enterpriseId === e.ssoEnterpriseId && 'bg-indigo-50',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{e.tradeName || e.legalName}</p>
                          <p className="text-[11px] font-mono text-gray-400 truncate">{e.ssoEnterpriseId}</p>
                        </div>
                        {e.baCode && (
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {e.baCode}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Show selected SSO ID below */}
            {enterpriseId && (
              <p className="mt-1 text-[11px] font-mono text-gray-400 truncate">{enterpriseId}</p>
            )}
          </div>

          {/* Trace button */}
          <div className="flex items-end w-full sm:w-auto">
            <button
              onClick={handleSearch}
              disabled={!invoiceId.trim() || traceMutation.isPending}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Search className="w-4 h-4" />
              {traceMutation.isPending ? 'Searching…' : 'Trace'}
            </button>
          </div>

        </div>
      </div>

      {traceMutation.isPending && <PageLoader />}

      {traceMutation.isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Search failed. Please check the invoice ID and try again.
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Pipeline status banner */}
          <div className={cn('flex items-center gap-3 p-4 rounded-xl border', pipelineColors[result.pipelineStatus as keyof typeof pipelineColors] || '')}>
            {PipelineIcon && <PipelineIcon className="w-5 h-5 flex-shrink-0" />}
            <div>
              <p className="font-semibold text-sm">
                Pipeline: {result.pipelineStatus.replace('_', ' ')}
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                {result.pipelineStatus === 'SYNCED' && 'All jobs completed successfully'}
                {result.pipelineStatus === 'NOT_SYNCED' && 'Invoice not captured by GIP — possible Debezium miss'}
                {result.pipelineStatus === 'PARTIAL' && 'Some delivery jobs failed'}
                {result.pipelineStatus === 'PENDING' && 'Jobs are still processing'}
              </p>
            </div>
          </div>

          {/* Step 1: Zwing record per enterprise */}
          {result.enterprises?.map((ent: any) => (
            <div key={ent.ssoEnterpriseId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Step 1 — Zwing Record</span>
                </div>
                <span className="text-xs text-gray-500">{ent.tradeName}</span>
              </div>
              <div className="p-5">
                {ent.zwingInvoice ? (
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    {[
                      ['Invoice ID', ent.zwingInvoice.invoice_id],
                      ['Store ID', ent.zwingInvoice.store_id],
                      ['Type', ent.zwingInvoice.transaction_type],
                      ['Sub-type', ent.zwingInvoice.transaction_sub_type],
                      ['Status', ent.zwingInvoice.status],
                      ['Total', ent.zwingInvoice.total],
                      ['Created', formatDate(ent.zwingInvoice.created_at)],
                      ['Sync Status', ent.zwingInvoice.sync_status],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-gray-400">{label}</p>
                        <p className="font-mono text-gray-800 mt-0.5">{String(value ?? '—')}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-yellow-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Invoice not found in Zwing tenant DB
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Step 2 + 3: GIP jobs */}
          {result.jobs?.length === 0 ? (
            <div className="bg-white rounded-xl border border-red-200 p-5">
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="w-4 h-4" />
                <span className="text-sm font-semibold">Step 2 — NOT CAPTURED by GIP</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                No GIP jobs found with refDocNo = <span className="font-mono">{invoiceId}</span>.
                This invoice was likely missed by Debezium.
              </p>
            </div>
          ) : (
            result.jobs?.map((job: any, i: number) => (
              <div key={job._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-medium text-gray-700">
                      Step 2+3 — GIP Job #{i + 1}
                    </span>
                    <Badge variant={job.status === 'success' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'}>
                      {job.status}
                    </Badge>
                  </div>
                  <button
                    onClick={() => router.push(`/jobs/${job._id}`)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Full Detail →
                  </button>
                </div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div><p className="text-gray-400">Connector</p><p className="text-gray-800">{job.connector?.name || '—'}</p></div>
                    <div><p className="text-gray-400">App Flow</p><p className="text-gray-800">{job.outboundApp?.name} → {job.inboundApp?.name}</p></div>
                    <div><p className="text-gray-400">Event</p><p className="font-mono text-gray-800">{job.event?.eventCode || '—'}</p></div>
                    <div><p className="text-gray-400">Date</p><p className="text-gray-800">{formatDate(job.transactionDate)}</p></div>
                    <div><p className="text-gray-400">Retries</p><p className="text-gray-800">{job.retryCount ?? 0}</p></div>
                  </div>
                  {job.error && (
                    <div className="p-2 bg-red-50 rounded text-xs text-red-600 font-mono">{job.error}</div>
                  )}
                  {/* Task summary */}
                  <div className="flex items-center gap-2 pt-1">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      Tasks: {job.taskSummary?.total ?? 0} total ·{' '}
                      <span className="text-green-600">{job.taskSummary?.success ?? 0} success</span> ·{' '}
                      <span className="text-red-600">{job.taskSummary?.failed ?? 0} failed</span>
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {traceMutation.isSuccess && !result && (
        <EmptyState message="No results found for this invoice ID" />
      )}
    </div>
  );
}
