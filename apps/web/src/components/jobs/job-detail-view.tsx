'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getJobDetail, retryJobs } from '@/lib/api-client';
import { formatDate, statusColor, cn } from '@/lib/utils';
import { PageLoader, ErrorState } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
  Filter, Globe, Wrench, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const statusVariantMap: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  success: 'success',
  failed: 'danger',
  pending: 'warning',
  processing: 'info',
};

const taskTypeIcon: Record<string, React.ElementType> = {
  filter: Filter,
  http: Globe,
  transform: Wrench,
};

function TaskIcon({ type }: { type: string }) {
  const Icon = taskTypeIcon[type] || Wrench;
  return <Icon className="w-3.5 h-3.5 text-gray-400" />;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === 'processing') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
}

export function JobDetailView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetail(jobId),
  });

  const retryMutation = useMutation({
    mutationFn: () => retryJobs([jobId]),
    onSuccess: () => {
      toast.success('Job queued for retry');
      qc.invalidateQueries({ queryKey: ['job-detail', jobId] });
    },
    onError: () => toast.error('Retry failed'),
  });

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  const job = data?.data;
  if (!job) return <ErrorState message="Job not found" />;

  const tasks: any[] = job.tasks || [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" /> Failed Jobs
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-gray-700 text-xs">{jobId}</span>
      </div>

      {/* Job header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusIcon status={job.status} />
              <span className="font-semibold text-gray-900">Job Detail</span>
              <Badge variant={statusVariantMap[job.status] || 'muted'}>{job.status}</Badge>
              {!job.isRetryable && <Badge variant="muted">Non-retryable</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
              <div><span className="text-gray-400">RefDoc:</span> <span className="font-mono text-gray-700">{job.refDocNo || '—'}</span></div>
              <div><span className="text-gray-400">Enterprise:</span> <span>{job.enterprise?.tradeName || job.ssoEnterpriseId}</span></div>
              <div><span className="text-gray-400">Connector:</span> <span>{job.connector?.name || '—'}</span></div>
              <div><span className="text-gray-400">App:</span> <span>{job.outboundApp?.name} → {job.inboundApp?.name}</span></div>
              <div><span className="text-gray-400">Event:</span> <span className="font-mono">{job.event?.eventCode || '—'}</span></div>
              <div><span className="text-gray-400">Retries:</span> <span>{job.retryCount ?? 0}</span></div>
              <div><span className="text-gray-400">Date:</span> <span>{formatDate(job.transactionDate)}</span></div>
            </div>
            {job.error && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">{job.error}</p>
              </div>
            )}
          </div>
          {job.isRetryable && job.status === 'failed' && (
            <button
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', retryMutation.isPending && 'animate-spin')} />
              Retry Job
            </button>
          )}
        </div>
      </div>

      {/* Status timeline */}
      {job.timestamps?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Timeline</h3>
          <div className="relative pl-5">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-200" />
            <div className="space-y-4">
              {job.timestamps.map((t: any, i: number) => (
                <div key={i} className="relative flex items-start gap-3">
                  <div className="absolute -left-3.5 top-0.5">
                    <StatusIcon status={t.status} />
                  </div>
                  <div className="ml-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariantMap[t.status] || 'muted'}>{t.status}</Badge>
                      <span className="text-xs text-gray-400">{formatDate(t.timestamp)}</span>
                    </div>
                    {t.error && (
                      <p className="text-xs text-red-500 mt-1 font-mono">{t.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Tasks ({tasks.length})
        </h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks found</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task: any) => (
              <div
                key={task._id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  task.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100',
                )}
              >
                <StatusIcon status={task.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <TaskIcon type={task.type} />
                    <span className="text-sm font-medium text-gray-800">{task.name}</span>
                    <Badge variant={statusVariantMap[task.status] || 'muted'}>{task.type}</Badge>
                    {task.continueOnFailure && (
                      <Badge variant="muted">continue-on-fail</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                    <span>Retries: {task.retryCount ?? 0}</span>
                    <span>{formatDate(task.createdAt)}</span>
                    {task.updatedAt !== task.createdAt && (
                      <span>→ {formatDate(task.updatedAt)}</span>
                    )}
                  </div>
                  {task.error && (
                    <p className="mt-1 text-xs text-red-600 font-mono break-all">{task.error}</p>
                  )}
                </div>
                <Badge variant={statusVariantMap[task.status] || 'muted'} className="flex-shrink-0">
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
