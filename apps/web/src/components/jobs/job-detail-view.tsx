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
  Filter, Globe, Wrench, Database, ChevronRight,
  X, RefreshCw, AlertCircle, GitBranch,
  Copy, Check, ChevronDown, ChevronRight as ChevronR, Braces, List,
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
  httpMetadataPath?: string | null;
  createdAt: string;
  updatedAt: string;
  timestamps: Array<{ status: string; timestamp: string; retryCount: number; error?: string }>;
}

interface TreeNode {
  task: Task;
  children: TreeNode[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusVariant: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  success: 'success', failed: 'danger', pending: 'warning', processing: 'info',
};

const typeIcon: Record<string, React.ElementType> = {
  filter: Filter, http: Globe, transform: Wrench, enrichment: Database,
};

const statusColor = {
  success:    { ring: 'border-green-300',  bg: 'bg-green-50',    strip: 'bg-green-400',  text: 'text-green-600'  },
  failed:     { ring: 'border-red-300',    bg: 'bg-red-50',      strip: 'bg-red-400',    text: 'text-red-600'    },
  processing: { ring: 'border-blue-300',   bg: 'bg-blue-50',     strip: 'bg-blue-400',   text: 'text-blue-600'   },
  pending:    { ring: 'border-yellow-300', bg: 'bg-yellow-50',   strip: 'bg-yellow-400', text: 'text-yellow-600' },
};
const defaultColor = { ring: 'border-gray-200', bg: 'bg-gray-50', strip: 'bg-gray-300', text: 'text-gray-500' };

function getColor(status: string) {
  return (statusColor as any)[status] ?? defaultColor;
}

function StatusDot({ status }: { status: string }) {
  const c = getColor(status);
  if (status === 'processing') return <Loader2  className={cn('w-3.5 h-3.5 animate-spin', c.text)} />;
  if (status === 'success')    return <CheckCircle2 className={cn('w-3.5 h-3.5', c.text)} />;
  if (status === 'failed')     return <XCircle  className={cn('w-3.5 h-3.5', c.text)} />;
  return <Clock className={cn('w-3.5 h-3.5', c.text)} />;
}

function TypeBadge({ type }: { type: string }) {
  const Icon = typeIcon[type] || Wrench;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-white border border-gray-200 rounded-md px-1.5 py-0.5 font-medium">
      <Icon className="w-3 h-3" />{type}
    </span>
  );
}

// ─── Build tree ───────────────────────────────────────────────────────────────

function buildTree(tasks: Task[]): TreeNode[] {
  const byId = new Map(tasks.map((t) => [t._id, t]));
  const childMap = new Map<string, Task[]>();

  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) {
      if (!childMap.has(t.parentId)) childMap.set(t.parentId, []);
      childMap.get(t.parentId)!.push(t);
    }
  }

  const buildNode = (task: Task): TreeNode => ({
    task,
    children: (childMap.get(task._id) ?? []).map(buildNode),
  });

  return tasks
    .filter((t) => !t.parentId || !byId.has(t.parentId))
    .map(buildNode);
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyBtn({ text, size = 'sm' }: { text: string; size?: 'sm' | 'xs' }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* ignore */ }
  };
  return (
    <button
      onClick={copy}
      title="Copy"
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors',
        size === 'sm' ? 'text-xs' : 'text-[10px]',
        ok ? 'text-green-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/10',
      )}
    >
      {ok ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {ok ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── JSON syntax highlight (code view) ───────────────────────────────────────

function highlight(json: string): React.ReactNode[] {
  // Token regex: string | number | bool/null | punctuation
  const re = /("(?:[^"\\]|\\.)*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:])/g;
  const nodes: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) nodes.push(<span key={idx++}>{json.slice(last, m.index)}</span>);
    const tok = m[0];
    let cls = 'text-gray-300';
    if (tok.endsWith(':'))       cls = 'text-blue-300';           // key
    else if (tok.startsWith('"')) cls = 'text-green-300';          // string value
    else if (tok === 'true' || tok === 'false') cls = 'text-orange-300'; // boolean
    else if (tok === 'null')     cls = 'text-gray-500';
    else if ('{}[]'.includes(tok)) cls = 'text-gray-400';
    else if (tok === ',' || tok === ':') cls = 'text-gray-500';
    else                          cls = 'text-purple-300';         // number
    nodes.push(<span key={idx++} className={cls}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < json.length) nodes.push(<span key={idx++}>{json.slice(last)}</span>);
  return nodes;
}

function CodeView({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="flex min-w-0 h-full">
      {/* Line numbers */}
      <div className="select-none shrink-0 text-right pr-3 pt-4 pb-4 text-[11px] leading-5 font-mono text-gray-600 border-r border-gray-700 min-w-[2.8rem]">
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      {/* Code */}
      <pre className="flex-1 overflow-auto p-4 text-[11px] leading-5 font-mono whitespace-pre">
        {highlight(text)}
      </pre>
    </div>
  );
}

// ─── JSON tree view ───────────────────────────────────────────────────────────

function JsonTreeNode({
  value, label, depth = 0, defaultOpen = true,
}: {
  value: unknown; label?: string | number; depth?: number; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const isObj  = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArr  = Array.isArray(value);
  const isNested = isObj || isArr;

  const entries = isNested
    ? isArr
      ? (value as unknown[]).map((v, i) => [i, v] as [string | number, unknown])
      : Object.entries(value as Record<string, unknown>)
    : [];

  const preview = isArr
    ? `[${(value as unknown[]).length}]`
    : isObj
    ? `{${Object.keys(value as object).length}}`
    : '';

  const valNode = !isNested ? (
    <span className={cn('font-mono text-[11px]',
      value === null              ? 'text-gray-500' :
      typeof value === 'boolean'  ? 'text-orange-300' :
      typeof value === 'number'   ? 'text-purple-300' :
                                    'text-green-300',
    )}>
      {JSON.stringify(value)}
    </span>
  ) : null;

  return (
    <div className={cn('text-[11px] font-mono', depth > 0 && 'ml-4 border-l border-gray-700 pl-2')}>
      <div
        className={cn('flex items-center gap-1 py-0.5', isNested && 'cursor-pointer hover:bg-white/5 rounded px-1')}
        onClick={isNested ? () => setOpen((o) => !o) : undefined}
      >
        {isNested && (
          open
            ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
            : <ChevronR    className="w-3 h-3 text-gray-500 shrink-0" />
        )}
        {!isNested && <span className="w-3 shrink-0" />}
        {label !== undefined && (
          <span className="text-blue-300 shrink-0">{JSON.stringify(String(label))}<span className="text-gray-500">: </span></span>
        )}
        {isNested ? (
          open
            ? <span className="text-gray-400">{isArr ? '[' : '{'}</span>
            : <span className="text-gray-400">{preview} <span className="text-gray-600">{isArr ? '…]' : '…}'}</span></span>
        ) : valNode}
      </div>

      {isNested && open && (
        <>
          {entries.map(([k, v]) => (
            <JsonTreeNode key={String(k)} value={v} label={k} depth={depth + 1} defaultOpen={depth < 1} />
          ))}
          <div className="py-0.5 px-1 text-gray-400">{isArr ? ']' : '}'}</div>
        </>
      )}
    </div>
  );
}

function TreeView({ data }: { data: unknown }) {
  return (
    <div className="overflow-auto h-full p-4 text-gray-200">
      <JsonTreeNode value={data} depth={0} defaultOpen />
    </div>
  );
}

// ─── BlobPanel — full-height code viewer with toolbar ─────────────────────────

type ViewMode = 'code' | 'tree';

function BlobPanel({ path, label }: { path: string; label: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['blob', path],
    queryFn: () => getBlobContent(path),
    staleTime: 300_000,
    retry: 1,
    enabled: !!path,
  });

  const [viewMode, setViewMode] = useState<ViewMode>('code');
  const [beautify,  setBeautify]  = useState(true);

  const raw     = data?.data;
  const parsed: unknown  = (() => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw as string); } catch { return raw; }
  })();
  const text = (() => {
    if (parsed === null || parsed === undefined) return '';
    if (typeof parsed === 'string') return parsed;
    return beautify ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
  })();

  const canTree = parsed !== null && typeof parsed === 'object';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar: path + reload */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
        <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider shrink-0">{label}</p>
        <p className="text-[10px] text-gray-500 font-mono truncate flex-1" title={path}>{path}</p>
        <button onClick={() => refetch()} title="Reload blob" className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Toolbar */}
      {!isLoading && !isError && text && (
        <div className="flex items-center gap-1 px-3 py-1 bg-gray-800 border-b border-gray-700 shrink-0">
          {/* View toggle */}
          <div className="flex items-center bg-gray-900 rounded overflow-hidden border border-gray-700 text-[10px]">
            <button
              onClick={() => setViewMode('code')}
              className={cn('flex items-center gap-1 px-2 py-1 transition-colors',
                viewMode === 'code' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}
            >
              <Braces className="w-3 h-3" /> Code
            </button>
            {canTree && (
              <button
                onClick={() => setViewMode('tree')}
                className={cn('flex items-center gap-1 px-2 py-1 transition-colors',
                  viewMode === 'tree' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}
              >
                <List className="w-3 h-3" /> Tree
              </button>
            )}
          </div>

          {viewMode === 'code' && (
            <button
              onClick={() => setBeautify((b) => !b)}
              className={cn('flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors border',
                beautify
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'border-gray-700 text-gray-400 hover:text-gray-200',
              )}
            >
              Beautify
            </button>
          )}

          <div className="ml-auto">
            <CopyBtn text={typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)} />
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 bg-gray-900 overflow-hidden">
        {isLoading && (
          <div className="flex items-center gap-2 p-4 text-xs text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {isError && (
          <div className="flex items-start gap-2 p-4">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-red-400 font-medium">Failed to load blob</p>
              <p className="text-[10px] text-red-500/70 font-mono mt-1 break-all">{(error as any)?.message ?? 'Unknown error'}</p>
            </div>
          </div>
        )}
        {!isLoading && !isError && !text && (
          <p className="p-4 text-xs text-gray-500 italic">Empty or no content at this path.</p>
        )}
        {!isLoading && !isError && text && viewMode === 'code' && <CodeView text={text} />}
        {!isLoading && !isError && text && viewMode === 'tree' && canTree && <TreeView data={parsed} />}
      </div>
    </div>
  );
}

// ─── Task card (flow node) ────────────────────────────────────────────────────

function TaskCard({
  task, isSelected, onClick,
}: { task: Task; isSelected: boolean; onClick: () => void }) {
  const c = getColor(task.status);
  const hasPayload = !!(task.inputDataPath || task.httpMetadataPath || task.outputDataPath);

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative text-left w-full max-w-sm rounded-xl border overflow-hidden transition-all duration-150',
        c.bg, c.ring,
        isSelected
          ? 'ring-2 ring-indigo-400 ring-offset-2 shadow-md'
          : 'hover:ring-2 hover:ring-indigo-200 hover:shadow-sm',
      )}
    >
      {/* Left status strip */}
      <div className={cn('absolute inset-y-0 left-0 w-1', c.strip)} />

      <div className="pl-4 pr-3 py-3">
        {/* Row 1: status icon + name + type */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={task.status} />
            <span className="text-sm font-semibold text-gray-900 truncate">{task.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <TypeBadge type={task.type} />
          </div>
        </div>

        {/* Row 2: badges + hints */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge variant={statusVariant[task.status] || 'muted'}>{task.status}</Badge>
          {task.retryCount > 0 && (
            <span className="text-[10px] text-orange-500 font-medium">↺ {task.retryCount}×</span>
          )}
          {task.continueOnFailure && (
            <span className="text-[10px] text-gray-400">continue-on-fail</span>
          )}
          {hasPayload && !isSelected && (
            <span className="ml-auto text-[10px] text-indigo-400 font-medium">payload ↗</span>
          )}
          {isSelected && (
            <span className="ml-auto text-[10px] text-indigo-600 font-semibold">● selected</span>
          )}
        </div>

        {/* Error */}
        {task.error && (
          <p className="mt-1.5 text-[11px] text-red-600 font-mono truncate bg-red-50 rounded px-2 py-1">
            {task.error}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Connector lines ──────────────────────────────────────────────────────────

function VConnector() {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className="w-0.5 h-5 bg-gray-200 rounded-full" />
      <div className="w-2 h-2 rounded-full bg-gray-300 -mt-1" />
    </div>
  );
}

// ─── Flow tree renderer ───────────────────────────────────────────────────────

function FlowTree({
  nodes, selectedId, onSelect,
}: {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0">
      {nodes.map((node, idx) => (
        <div key={node.task._id} className="flex flex-col items-center w-full">
          {idx > 0 && <VConnector />}
          <FlowNode node={node} selectedId={selectedId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}

function FlowNode({
  node, selectedId, onSelect,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (task: Task) => void;
}) {
  const { task, children } = node;
  const hasChildren = children.length > 0;
  const parallel = children.length > 1;

  return (
    <div className="flex flex-col items-center w-full">
      {/* This task's card */}
      <div className="w-full flex justify-center">
        <TaskCard
          task={task}
          isSelected={selectedId === task._id}
          onClick={() => onSelect(task)}
        />
      </div>

      {/* Children */}
      {hasChildren && (
        <>
          <VConnector />
          {parallel ? (
            /* ── Branching: side-by-side ── */
            <div className="relative w-full">
              {/* Horizontal bridge line */}
              <div className="absolute top-0 left-[10%] right-[10%] h-0.5 bg-gray-200 rounded-full" />
              <div className="flex justify-around gap-4 pt-0">
                {children.map((child, i) => (
                  <div key={child.task._id} className="flex flex-col items-center flex-1 min-w-0">
                    {/* Drop from bridge */}
                    <div className="w-0.5 h-5 bg-gray-200" />
                    <div className="w-2 h-2 rounded-full bg-gray-300 -mt-1 mb-0.5" />
                    <div className="w-full flex flex-col items-center">
                      <FlowNode node={child} selectedId={selectedId} onSelect={onSelect} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Linear: single child ── */
            <FlowNode node={children[0]} selectedId={selectedId} onSelect={onSelect} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Task side panel ─────────────────────────────────────────────────────────

function TaskSidePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const isHttp = task.type === 'http';
  type TabId = 'input' | 'output' | 'http' | 'timeline';
  const [activeTab, setActiveTab] = useState<TabId>(task.inputDataPath ? 'input' : 'timeline');

  const hasDifferentOutput = task.outputDataPath && task.outputDataPath !== task.inputDataPath;

  const tabs: Array<{ id: TabId; label: string; show: boolean }> = [
    { id: 'input',    label: 'Request',       show: !!task.inputDataPath },
    { id: 'output',   label: 'Output',        show: !!hasDifferentOutput },
    { id: 'http',     label: 'HTTP Response', show: isHttp && !!task.httpMetadataPath },
    { id: 'timeline', label: 'Timeline',      show: true },
  ];
  const visibleTabs = tabs.filter((t) => t.show);

  const c = getColor(task.status);

  return (
    <div className="flex flex-col h-full">
      {/* Coloured top strip */}
      <div className={cn('h-1 w-full', c.strip)} />

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={task.status} />
            <span className="font-semibold text-gray-900 text-sm truncate">{task.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant={statusVariant[task.status] || 'muted'}>{task.status}</Badge>
            <TypeBadge type={task.type} />
            {task.retryCount > 0 && (
              <span className="text-[10px] text-orange-500 font-medium">↺ retried {task.retryCount}×</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 ml-2 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Error banner */}
      {task.error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-[10px] font-semibold text-red-400 mb-1 uppercase tracking-wider">Error</p>
          <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">{task.error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4 mt-3 overflow-x-auto">
        {visibleTabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content — payload tabs fill remaining height; timeline scrolls normally */}
      {activeTab === 'timeline' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status history</p>
          <div className="relative pl-5">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-200" />
            {task.timestamps.map((t, i) => (
              <div key={i} className="relative flex items-start gap-3 mb-3">
                <div className="absolute -left-3.5 top-0.5">
                  <StatusDot status={t.status} />
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
          {(task.inputDataPath || task.outputDataPath || task.httpMetadataPath) && (
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Blob paths</p>
              {[
                { label: 'in', path: task.inputDataPath },
                { label: 'out', path: task.outputDataPath },
                { label: 'http', path: task.httpMetadataPath },
              ].filter((x) => x.path).map(({ label, path }) => (
                <p key={label} className="text-[10px] font-mono text-gray-400 break-all">
                  <span className="text-gray-300">{label}: </span>{path}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Payload tabs — BlobPanel fills the full remaining height */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === 'input' && (
            task.inputDataPath
              ? <BlobPanel path={task.inputDataPath} label="Request payload" />
              : <p className="p-4 text-xs text-gray-400 italic">No input path stored</p>
          )}
          {activeTab === 'output' && (
            task.outputDataPath
              ? <BlobPanel path={task.outputDataPath} label="Output payload" />
              : <p className="p-4 text-xs text-gray-400 italic">No output path stored</p>
          )}
          {activeTab === 'http' && (
            task.httpMetadataPath
              ? <BlobPanel path={task.httpMetadataPath} label="HTTP response" />
              : <p className="p-4 text-xs text-gray-400 italic">No HTTP metadata path stored</p>
          )}
        </div>
      )}
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
  const roots = buildTree(tasks);

  const handleSelect = (task: Task) => {
    setSelectedTask((prev) => (prev?._id === task._id ? null : task));
  };

  return (
    <>
      {/* ── Job info + flow (always full-width now) ── */}
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-mono text-gray-700 text-xs truncate">{jobId}</span>
        </div>

        {/* Job summary card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className={cn('h-1', getColor(job.status).strip)} />
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <StatusDot status={job.status} />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">Job</span>
                  <Badge variant={statusVariant[job.status] || 'muted'}>{job.status}</Badge>
                  {!job.isRetryable && <Badge variant="muted">non-retryable</Badge>}
                  <span className="font-mono text-[11px] text-gray-400 ml-auto">{jobId}</span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
                  <div><dt className="inline text-gray-400">RefDoc: </dt><dd className="inline font-mono text-gray-700">{job.refDocNo || '—'}</dd></div>
                  <div><dt className="inline text-gray-400">Enterprise: </dt><dd className="inline">{job.enterprise?.tradeName || job.ssoEnterpriseId}</dd></div>
                  <div><dt className="inline text-gray-400">Connector: </dt><dd className="inline">{job.connector?.name || '—'}</dd></div>
                  <div><dt className="inline text-gray-400">App: </dt><dd className="inline">{job.outboundApp?.name} → {job.inboundApp?.name}</dd></div>
                  <div><dt className="inline text-gray-400">Event: </dt><dd className="inline font-mono">{job.event?.eventCode || '—'}</dd></div>
                  <div><dt className="inline text-gray-400">Date: </dt><dd className="inline">{formatDate(job.transactionDate)}</dd></div>
                </dl>
                {job.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                    <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">{job.error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Flow diagram */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">Task Flow</h3>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{tasks.length}</span>
            </div>
            {selectedTask && (
              <button
                onClick={() => setSelectedTask(null)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" /> Deselect
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No tasks recorded for this job</p>
          ) : (
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                <FlowTree
                  nodes={roots}
                  selectedId={selectedTask?._id ?? null}
                  onSelect={handleSelect}
                />
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
            {[
              { status: 'success',    label: 'Success'    },
              { status: 'failed',     label: 'Failed'     },
              { status: 'pending',    label: 'Pending'    },
              { status: 'processing', label: 'Processing' },
            ].map(({ status, label }) => {
              const c = getColor(status);
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <div className={cn('w-2.5 h-2.5 rounded-full', c.strip)} />
                  <span className="text-[10px] text-gray-500">{label}</span>
                </div>
              );
            })}
            <span className="text-[10px] text-gray-400 ml-auto">Click a task to view payload</span>
          </div>
        </div>
      </div>

      {/* ── Left-side drawer overlay ── */}
      {selectedTask && (
        <>
          {/* Backdrop — click to close */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] animate-fade-in"
            onClick={() => setSelectedTask(null)}
          />

          {/* Drawer panel — slides in from the right, 80% wide */}
          <div
            className={cn(
              'fixed inset-y-0 right-0 z-50 w-[80vw] max-w-3xl',
              'bg-white shadow-2xl flex flex-col',
              'animate-slide-in-right',
            )}
          >
            <TaskSidePanel task={selectedTask} onClose={() => setSelectedTask(null)} />
          </div>
        </>
      )}
    </>
  );
}
