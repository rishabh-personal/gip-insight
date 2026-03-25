'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { traceInvoice } from '@/lib/api-client';
import { formatDate, statusColor, cn } from '@/lib/utils';
import { PageLoader, EmptyState } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  Search, CheckCircle2, XCircle, AlertTriangle, Clock, ChevronRight,
  Database, Zap, Package,
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
  const [invoiceId, setInvoiceId] = useState(searchParams.get('invoiceId') || '');
  const [enterpriseId, setEnterpriseId] = useState(searchParams.get('ssoEnterpriseId') || '');
  const router = useRouter();

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
        <div className="flex gap-3">
          <div className="flex-1">
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
          <div className="w-64">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Enterprise ID <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={enterpriseId}
              onChange={(e) => setEnterpriseId(e.target.value)}
              placeholder="ssoEnterpriseId…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={!invoiceId.trim() || traceMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
