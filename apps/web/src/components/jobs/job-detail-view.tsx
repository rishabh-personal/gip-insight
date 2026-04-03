'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getJobDetail, getBlobContent } from '@/lib/api-client';
import { formatDate, cn } from '@/lib/utils';
import { PageLoader, ErrorState } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Loader2,
  Filter, Globe, Wrench, ChevronRight, X, Download,
  ChevronDown, ChevronUp, Database,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  _id: string;
  name: string;
  type: string;
  status: string;
  error?: string;
  retryCount: number;
  continueOnFailure: boolean;
  parentId?: string | null;
  inputDataPath?: string | null;
  outputDataPath?: string | null;
  createdAt: string;
  updatedAt: string;
  timestamps: Array<{ status: string; timestamp: string; retryCount: number; error?: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusVariant: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  success: 'success', failed: 'danger', pending: 'warning', processing: 'info',
};

const taskTypeIcon: Record<string, React.ElementType> = {
  filter: Filter, http: Globe, transform: Wrench, enrichment: Database,
};

function StatusIcon({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  if (status === 'success')    return <CheckCircle2 className={cn(cls, 'text-green-500')} />;
  if (status === 'failed')     return <XCircle      className={cn(cls, 'text-red-500')} />;
  if (status === 'processing') return <Loader2      className={cn(cls, 'text-blue-500 animate-spin')} />;
  return                              <Clock        className={cn(cls, 'text-yellow-500')} />;
}

function TaskIcon({ type }: { type: string }) {
  const Icon = taskTypeIcon[type] || Wrench;
  return <Icon className="w-3.5 h-3.5" />;
}

// Build task tree: root tasks + their children
function buildTree(tasks: Task[]): Task[][] {
  const byId = new Map(tasks.map((t) => [t._id, t]));
  const roots = tasks.filter((t) => !t.parentId || !byId.has(t.parentId));
  const childrenOf = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) {
      if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
      childrenOf.get(t.parentId)!.push(t);
    }
  }
  // Flatten: roots, then their children inline (BFS order for visual flow)
  const ordered: Task[] = [];
  const visit = (t: Task) => {
    ordered.push(t);
    for (const child of childrenOf.get(t._id) || []) visit(child);
  };
  for (const r of roots) visit(r);
  return [ordered]; // single pipeline lane
}

// ─── JsonViewer ──────────────────────────────────────────────────────────────

function JsonViewer({ data }: { data: any }) {
  if (data === null || data === undefined) {
    return <p className="text-xs text-gray-400 italic">No data</p>;
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="text-[11px] leading-relaxed font-mono text-gray-700 whitespace-pre-wrap break-all overflow-auto max-h-96">
      {text}
    </pre>
  );
}

// ─── BlobPanel ───────────────────────────────────────────────────────────────

function BlobPanel({ path, label }: { path: string; label: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['blob', path],
    queryFn: () => getBlobContent(path),
    staleTime: 300_000,
    enabled: !!path,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-[10px] text-gray-300 font-mono truncate max-w-[200px]" title={path}>{path}</p>
      </div>
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
        {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
        {isError  && <p className="text-xs text-red-400">Failed to load blob</p>}
        {!isLoading && !isError && <JsonViewer data={data?.data} />}
      </div>
    </div>
  );
}

// ─── TaskNode ─────────────────────────────────────────────────────────────────

function TaskNode({
  task,
  isSelected,
  isChild,
  onClick,
}: {
  task: Task;
  isSelected: boolean;
  isChild: boolean;
  onClick: () => void;
}) {
  const borderColor =
    task.status === 'failed'     ? 'border-red-300 bg-red-50'   :
    task.status === 'success'    ? 'border-green-200 bg-green-50/40' :
    task.status === 'processing' ? 'border-blue-200 bg-blue-50/40'  :
                                   'border-gray-200 bg-gray-50';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border-2 px-4 py-3 transition-all',
        borderColor,
        isSelected ? 'ring-2 ring-indigo-400 ring-offset-1' : 'hover:ring-1 hover:ring-indigo-200',
        isChild && 'ml-6',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <StatusIcon status={task.status} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{task.name}</span>
              <span className="flex items-center gap-1 text-[10px] text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                <TaskIcon type={task.type} />
                {task.type}
              </span>
              {task.continueOnFailure && (
                <span className="text-[10px] text-orange-500 font-medium">continue-on-fail</span>
              )}
            </div>
            {task.error && (
              <p className="text-xs text-red-500 font-mono mt-0.5 truncate max-w-md">{task.error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <Badge variant={statusVariant[task.status] || 'muted'}>{task.status}</Badge>
          {(task.inputDataPath || task.outputDataPath) && (
            <span className="text-[10px] text-indigo-400 font-medium">View payload →</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── TaskSidePanel ────────────────────────────────────────────────────────────

function TaskSidePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'timeline'>('input');
  const hasSameBlob = task.inputDataPath && task.inputDataPath === task.outputDataPath;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={task.status} size="sm" />
            <span className="font-semibold text-gray-900 text-sm truncate">{task.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={statusVariant[task.status] || 'muted'}>{task.status}</Badge>
            <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 flex items-center gap-1">
              <TaskIcon type={task.type} />{task.type}
            </span>
            {task.retryCount > 0 && (
              <span className="text-[10px] text-orange-500">Retried {task.retryCount}×</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Error */}
      {task.error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-[10px] font-semibold text-red-400 mb-1 uppercase tracking-wider">Error</p>
          <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">{task.error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4 mt-3">
        {(['input', 'output', 'timeline'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors capitalize',
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            {tab === 'input' ? 'Request' : tab === 'output' ? 'Response' : 'Timeline'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'input' && (
          task.inputDataPath
            ? <BlobPanel path={task.inputDataPath} label="Input payload (request)" />
            : <p className="text-xs text-gray-400 italic">No input path stored for this task</p>
        )}
        {activeTab === 'output' && (
          hasSameBlob
            ? <p className="text-xs text-gray-400 italic">Input and output point to the same blob — see Request tab</p>
            : task.outputDataPath
              ? <BlobPanel path={task.outputDataPath} label="Output payload (response)" />
              : <p className="text-xs text-gray-400 italic">No output path stored for this task</p>
        )}
        {activeTab === 'timeline' && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status history</p>
            <div className="relative pl-5">
              <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-200" />
              {task.timestamps.map((t, i) => (
                <div key={i} className="relative flex items-start gap-3 mb-3">
                  <div className="absolute -left-3.5 top-0.5">
                    <StatusIcon status={t.status} size="sm" />
                  </div>
                  <div className="ml-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[t.status] || 'muted'}>{t.status}</Badge>
                      <span className="text-[10px] text-gray-400">{formatDate(t.timestamp)}</span>
                    </div>
                    {t.error && <p className="text-xs text-red-500 mt-0.5 font-mono">{t.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function JobDetailView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetail(jobId),
  });

  if (isLoading) return <PageLoader />;
  if (isError)   return <ErrorState />;

  const job = data?.data;
  if (!job) return <ErrorState message="Job not found" />;

  const tasks: Task[] = job.tasks || [];
  const [orderedTasks] = buildTree(tasks);

  return (
    <div className="flex gap-5 h-full">
      {/* ── Main column ── */}
      <div className={cn('flex-1 min-w-0 space-y-5', selectedTask && 'max-w-[calc(100%-360px)]')}>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" /> Failed Jobs
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-mono text-gray-700 text-xs">{jobId}</span>
        </div>

        {/* Job header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-3">
            <StatusIcon status={job.status} />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">Job Detail</span>
                <Badge variant={statusVariant[job.status] || 'muted'}>{job.status}</Badge>
                {!job.isRetryable && <Badge variant="muted">Non-retryable</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
                <div><span className="text-gray-400">RefDoc: </span><span className="font-mono text-gray-700">{job.refDocNo || '—'}</span></div>
                <div><span className="text-gray-400">Enterprise: </span><span>{job.enterprise?.tradeName || job.ssoEnterpriseId}</span></div>
                <div><span className="text-gray-400">Connector: </span><span>{job.connector?.name || '—'}</span></div>
                <div><span className="text-gray-400">App: </span><span>{job.outboundApp?.name} → {job.inboundApp?.name}</span></div>
                <div><span className="text-gray-400">Event: </span><span className="font-mono">{job.event?.eventCode || '—'}</span></div>
                <div><span className="text-gray-400">Retries: </span><span>{job.retryCount ?? 0}</span></div>
                <div><span className="text-gray-400">Date: </span><span>{formatDate(job.transactionDate)}</span></div>
              </div>
              {job.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                  <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">{job.error}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workflow */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Task Pipeline ({tasks.length})</h3>
            {selectedTask && (
              <button
                onClick={() => setSelectedTask(null)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear selection
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400">No tasks recorded</p>
          ) : (
            <div className="space-y-1">
              {orderedTasks.map((task, idx) => {
                const isChild = !!(task.parentId && tasks.find((t) => t._id === task.parentId));
                return (
                  <div key={task._id}>
                    {/* Connector arrow between tasks */}
                    {idx > 0 && (
                      <div className={cn('flex items-center my-1', isChild ? 'ml-8' : 'ml-4')}>
                        <div className="w-px h-4 bg-gray-200 mx-2" />
                        <ChevronDown className="w-3 h-3 text-gray-300 -ml-0.5" />
                      </div>
                    )}
                    <TaskNode
                      task={task}
                      isSelected={selectedTask?._id === task._id}
                      isChild={isChild}
                      onClick={() => setSelectedTask(selectedTask?._id === task._id ? null : task)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Side panel ── */}
      {selectedTask && (
        <div className="w-[360px] shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col sticky top-0 max-h-[calc(100vh-120px)]">
          <TaskSidePanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
          />
        </div>
      )}
    </div>
  );
}
