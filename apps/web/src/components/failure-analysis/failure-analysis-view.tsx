'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  getFailureSummary,
  getFailureCategories,
  getFailureCases,
  createFailureCategory,
  updateFailureCategory,
  deleteFailureCategory,
  createFailureCase,
  updateFailureCase,
  deleteFailureCase,
  incrementFailureOccurrence,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  BookMarked, Plus, X, ChevronDown, ChevronUp,
  Pencil, Trash2, Check, ExternalLink, RefreshCw,
  Tags, AlertTriangle, TrendingUp, Plug,
  Clock, CheckCircle2, AlertCircle, Ban,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category { _id: string; name: string; description: string; color: string; connectorName: string | null; isActive: boolean; }
interface FailureCase {
  _id: string; categoryId: string; categoryName: string;
  ssoEnterpriseId: string; enterpriseName: string;
  connectorId: string | null; connectorName: string | null;
  refDocNo: string | null; dipJobId: string | null;
  notes: string; status: string; resolution: string;
  resolvedAt: string | null; occurrenceCount: number;
  createdAt: string;
}
type FailureStatus = 'open' | 'investigating' | 'resolved' | 'wont_fix';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  open:          { label: 'Open',          icon: AlertCircle,  cls: 'bg-red-50    text-red-700    border-red-200'    },
  investigating: { label: 'Investigating', icon: Clock,        cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
  resolved:      { label: 'Resolved',      icon: CheckCircle2, cls: 'bg-green-50  text-green-700  border-green-200'  },
  wont_fix:      { label: "Won't Fix",     icon: Ban,          cls: 'bg-gray-50   text-gray-600   border-gray-200'   },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.open;
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border', m.cls)}>
      <Icon className="w-2.5 h-2.5" />{m.label}
    </span>
  );
}

function ColorDot({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function Spinner() {
  return <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />;
}

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280'];

function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Category Manager Modal ───────────────────────────────────────────────────

function CategoryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: rawCats, isLoading } = useQuery<Category[]>({ queryKey: ['ft-categories'], queryFn: () => getFailureCategories() });
  const cats: Category[] = rawCats ?? [];
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [connector, setConnector] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => createFailureCategory({ name, description: desc, color, connectorName: connector || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ft-categories'] }); qc.invalidateQueries({ queryKey: ['ft-summary'] }); reset(); },
  });
  const updateMut = useMutation({
    mutationFn: (id: string) => updateFailureCategory(id, { name, description: desc, color, connectorName: connector || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ft-categories'] }); reset(); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteFailureCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ft-categories'] }); qc.invalidateQueries({ queryKey: ['ft-summary'] }); },
  });

  function reset() { setName(''); setDesc(''); setColor(COLORS[0]); setConnector(''); setEditId(null); }

  function startEdit(cat: Category) {
    setEditId(cat._id); setName(cat.name); setDesc(cat.description);
    setColor(cat.color); setConnector(cat.connectorName ?? '');
  }

  function submit() {
    if (!name.trim()) return;
    if (editId) updateMut.mutate(editId);
    else createMut.mutate();
  }

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Tags className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Manage Failure Categories</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="flex flex-col md:flex-row gap-0 flex-1 min-h-0 overflow-hidden">
          {/* Form */}
          <div className="md:w-64 p-4 border-b md:border-b-0 md:border-r border-gray-100 flex-shrink-0 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{editId ? 'Edit Category' : 'New Category'}</p>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="e.g. API Timeout" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Description</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                placeholder="Optional description" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Connector (leave blank = global)</label>
              <input value={connector} onChange={(e) => setConnector(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="e.g. Zwing to ERP" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    className={cn('w-5 h-5 rounded-full border-2 transition-all', color === c ? 'border-gray-800 scale-110' : 'border-transparent')}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={submit} disabled={!name.trim() || busy}
                className="flex-1 text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {busy ? '…' : editId ? 'Update' : 'Create'}
              </button>
              {editId && <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 px-2">Cancel</button>}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
            {isLoading && <p className="text-xs text-gray-400 text-center py-4">Loading…</p>}
            {!isLoading && cats.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No categories yet.</p>}
            {cats.map((cat) => (
              <div key={cat._id} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <ColorDot color={cat.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{cat.name}</p>
                  {cat.connectorName && <p className="text-[10px] text-indigo-600">{cat.connectorName}</p>}
                  {cat.description && <p className="text-[10px] text-gray-400 truncate">{cat.description}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(cat)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-indigo-600"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => deleteMut.mutate(cat._id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Log Case Modal ───────────────────────────────────────────────────────────

function LogCaseModal({ onClose, prefill }: { onClose: () => void; prefill?: Partial<FailureCase> }) {
  const qc = useQueryClient();
  const { data: rawCats2 } = useQuery<Category[]>({ queryKey: ['ft-categories'], queryFn: () => getFailureCategories() });
  const cats: Category[] = rawCats2 ?? [];

  const [categoryId, setCategoryId] = useState(prefill?.categoryId ?? '');
  const [enterprise, setEnterprise] = useState(prefill?.ssoEnterpriseId ?? '');
  const [enterpriseName, setEnterpriseName] = useState(prefill?.enterpriseName ?? '');
  const [connectorId, setConnectorId] = useState(prefill?.connectorId ?? '');
  const [connectorName, setConnectorName] = useState(prefill?.connectorName ?? '');
  const [refDocNo, setRefDocNo] = useState(prefill?.refDocNo ?? '');
  const [dipJobId, setDipJobId] = useState(prefill?.dipJobId ?? '');
  const [notes, setNotes] = useState(prefill?.notes ?? '');

  const mut = useMutation({
    mutationFn: () => createFailureCase({
      categoryId, ssoEnterpriseId: enterprise, enterpriseName,
      connectorId: connectorId || null, connectorName: connectorName || null,
      refDocNo: refDocNo || null, dipJobId: dipJobId || null, notes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ft-cases'] });
      qc.invalidateQueries({ queryKey: ['ft-summary'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Log Failure Case</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs text-gray-500 mb-0.5 block">Root Cause Category *</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
              <option value="">Select category…</option>
              {cats.map((c: Category) => (
                <option key={c._id} value={c._id}>{c.name}{c.connectorName ? ` (${c.connectorName})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Enterprise SSO ID *</label>
              <input value={enterprise} onChange={(e) => setEnterprise(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="01J…" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Enterprise Name</label>
              <input value={enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Display name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Connector Name</label>
              <input value={connectorName} onChange={(e) => setConnectorName(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Zwing to ERP" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Connector ID</label>
              <input value={connectorId} onChange={(e) => setConnectorId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="MongoDB _id" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Invoice / Ref Doc No</label>
              <input value={refDocNo} onChange={(e) => setRefDocNo(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="e.g. 98765" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">GIP Job ID</label>
              <input value={dipJobId} onChange={(e) => setDipJobId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="DipJob _id" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-0.5 block">Notes / Error Snippet</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              placeholder="Paste error message or describe the failure…" />
          </div>
          <button
            onClick={() => mut.mutate()}
            disabled={!categoryId || !enterprise || mut.isPending}
            className="w-full text-sm font-medium bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {mut.isPending ? 'Saving…' : 'Log Case'}
          </button>
          {mut.isError && <p className="text-xs text-red-600 text-center">{(mut.error as any)?.response?.data?.message ?? 'Error saving case'}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Update Case Popover ──────────────────────────────────────────────────────

function UpdateCasePopover({ case: c, onClose }: { case: FailureCase; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FailureStatus>(c.status as FailureStatus);
  const [resolution, setResolution] = useState(c.resolution ?? '');
  const [notes, setNotes] = useState(c.notes ?? '');

  const updateMut = useMutation({
    mutationFn: () => updateFailureCase(c._id, { status, resolution, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ft-cases'] }); qc.invalidateQueries({ queryKey: ['ft-summary'] }); onClose(); },
  });
  const incMut = useMutation({
    mutationFn: () => incrementFailureOccurrence(c._id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ft-cases'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Update Case</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS_META) as FailureStatus[]).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn('text-xs px-2.5 py-1 rounded-full border transition-all font-medium',
                    status === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300')}>
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          {(status === 'resolved' || status === 'wont_fix') && (
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Resolution / Notes</label>
              <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                placeholder="Describe the fix…" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-0.5 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
              className="flex-1 text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50">
              {updateMut.isPending ? '…' : 'Save'}
            </button>
            <button onClick={() => incMut.mutate()} disabled={incMut.isPending}
              title="Mark one more occurrence of this failure"
              className="text-xs font-medium border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50">
              +1 occurrence
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummarySection({ summary }: { summary: any }) {
  const t = summary?.totals ?? {};
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Open',          value: t.open ?? 0,          cls: 'text-red-600',    bg: 'bg-red-50',    icon: AlertCircle  },
        { label: 'Investigating', value: t.investigating ?? 0,  cls: 'text-amber-600',  bg: 'bg-amber-50',  icon: Clock        },
        { label: 'Resolved',      value: t.resolved ?? 0,       cls: 'text-green-600',  bg: 'bg-green-50',  icon: CheckCircle2 },
        { label: "Won't Fix",     value: t.wont_fix ?? 0,       cls: 'text-gray-600',   bg: 'bg-gray-50',   icon: Ban          },
      ].map(({ label, value, cls, bg, icon: Icon }) => (
        <div key={label} className={cn('rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3', bg)}>
          <Icon className={cn('w-5 h-5', cls)} />
          <div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-xl font-bold leading-none', cls)}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Case Row ─────────────────────────────────────────────────────────────────

function CaseRow({ c, cats, onUpdate, onDelete }: { c: FailureCase; cats: Category[]; onUpdate: (c: FailureCase) => void; onDelete: (id: string) => void }) {
  const cat = cats.find((x) => x._id === c.categoryId);
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-1.5">
          <ColorDot color={cat?.color ?? '#6b7280'} />
          <span className="text-xs font-medium text-gray-800">{c.categoryName}</span>
        </div>
        {c.connectorName && (
          <p className="text-[10px] text-indigo-600 ml-4 mt-0.5">{c.connectorName}</p>
        )}
      </td>
      <td className="py-2.5 px-2">
        <p className="text-xs font-medium text-gray-800 truncate max-w-[140px]">{c.enterpriseName || c.ssoEnterpriseId}</p>
        <p className="text-[10px] text-gray-400 font-mono truncate max-w-[140px]">{c.ssoEnterpriseId}</p>
      </td>
      <td className="py-2.5 px-2">
        {c.refDocNo ? (
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-gray-700">{c.refDocNo}</span>
            <Link href={`/trace?invoiceId=${encodeURIComponent(c.refDocNo)}&ssoEnterpriseId=${encodeURIComponent(c.ssoEnterpriseId)}`}
              className="text-gray-300 hover:text-indigo-600" title="Trace invoice" target="_blank">
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        ) : <span className="text-[10px] text-gray-300">—</span>}
        {c.dipJobId && (
          <Link href={`/jobs/${c.dipJobId}`} className="text-[10px] text-indigo-500 hover:underline flex items-center gap-0.5" target="_blank">
            Job <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
      </td>
      <td className="py-2.5 px-2 hidden sm:table-cell">
        <p className="text-[10px] text-gray-500 line-clamp-2 max-w-[180px]">{c.notes || '—'}</p>
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-1">
          <StatusBadge status={c.status} />
          {c.occurrenceCount > 1 && (
            <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">×{c.occurrenceCount}</span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-2 hidden md:table-cell">
        <p className="text-[10px] text-gray-400">{fmtDate(c.createdAt)}</p>
      </td>
      <td className="py-2.5 pr-4 pl-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onUpdate(c)} className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600" title="Update">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(c._id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Top-level view ───────────────────────────────────────────────────────────

export function FailureAnalysisView() {
  const qc = useQueryClient();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showCategories, setShowCategories] = useState(false);
  const [showLogCase, setShowLogCase] = useState(false);
  const [editCase, setEditCase] = useState<FailureCase | null>(null);

  // ── Section toggles ───────────────────────────────────────────────────────
  const [showByCategory, setShowByCategory] = useState(true);
  const [showByConnector, setShowByConnector] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────
  const summaryQ = useQuery<any>({ queryKey: ['ft-summary'], queryFn: getFailureSummary, refetchInterval: 60_000 });
  const catsQ = useQuery<Category[]>({ queryKey: ['ft-categories'], queryFn: () => getFailureCategories() });
  const casesQ = useQuery<{ data: FailureCase[]; meta: { total: number; pages: number; page: number; limit: number } }>({
    queryKey: ['ft-cases', status, debouncedSearch, page],
    queryFn: () => getFailureCases({ status: status || undefined, search: debouncedSearch || undefined, page, limit: 30 }),
    placeholderData: (prev) => prev,
  });

  const deleteMut = useMutation({
    mutationFn: deleteFailureCase,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ft-cases'] }); qc.invalidateQueries({ queryKey: ['ft-summary'] }); },
  });

  const cats: Category[] = catsQ.data ?? [];
  const summary = summaryQ.data;
  const cases: FailureCase[] = casesQ.data?.data ?? [];
  const meta = casesQ.data?.meta ?? { total: 0, pages: 1 };

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-indigo-600" />
          <div>
            <h1 className="text-base font-bold text-gray-900">Failure Analysis</h1>
            <p className="text-xs text-gray-500">Track root causes and occurrence patterns across all enterprises</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategories(true)}
            className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
            <Tags className="w-3.5 h-3.5" /> Categories
          </button>
          <button onClick={() => setShowLogCase(true)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Log Failure
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summaryQ.isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <SummarySection summary={summary} />
      )}

      {/* Breakdown charts — by category & connector */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* By category */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button onClick={() => setShowByCategory((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-gray-700">By Root Cause</span>
              </div>
              {showByCategory ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            {showByCategory && (
              <div className="px-4 pb-4 space-y-2">
                {(summary.byCategory ?? []).length === 0 && <p className="text-xs text-gray-400 text-center py-2">No data yet</p>}
                {(summary.byCategory ?? []).map((r: any) => {
                  const cat = cats.find((c) => c._id === r.categoryId?.toString());
                  const pct = summary.totals.total > 0 ? Math.round((r.count / summary.totals.total) * 100) : 0;
                  return (
                    <div key={r.categoryId}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <ColorDot color={cat?.color ?? '#6b7280'} />
                          <span className="text-xs text-gray-700">{r.categoryName}</span>
                          {r.open > 0 && <span className="text-[10px] text-red-600 font-semibold">{r.open} open</span>}
                        </div>
                        <span className="text-xs font-semibold text-gray-800">{r.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat?.color ?? '#6b7280' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* By connector */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button onClick={() => setShowByConnector((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <Plug className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-gray-700">By Connector</span>
              </div>
              {showByConnector ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            {showByConnector && (
              <div className="px-4 pb-4 space-y-2">
                {(summary.byConnector ?? []).length === 0 && <p className="text-xs text-gray-400 text-center py-2">No connector-specific cases yet</p>}
                {(summary.byConnector ?? []).map((r: any) => {
                  const pct = summary.totals.total > 0 ? Math.round((r.count / summary.totals.total) * 100) : 0;
                  return (
                    <div key={r.connectorName}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-700 truncate max-w-[200px]">{r.connectorName}</span>
                          {r.open > 0 && <span className="text-[10px] text-red-600 font-semibold">{r.open} open</span>}
                        </div>
                        <span className="text-xs font-semibold text-gray-800">{r.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cases table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Table toolbar */}
        <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-gray-100">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search enterprise, connector, ref doc, notes…"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => { summaryQ.refetch(); casesQ.refetch(); }}
            className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-500 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <RefreshCw className={cn('w-3.5 h-3.5', (summaryQ.isFetching || casesQ.isFetching) && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-2 pl-4 pr-2">Category</th>
                <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-2 px-2">Enterprise</th>
                <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-2 px-2">Ref Doc</th>
                <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-2 px-2 hidden sm:table-cell">Notes</th>
                <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-2 px-2">Status</th>
                <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-2 px-2 hidden md:table-cell">Logged</th>
                <th className="py-2 pr-4 pl-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {casesQ.isLoading && (
                <tr><td colSpan={7} className="py-10 text-center"><Spinner /></td></tr>
              )}
              {!casesQ.isLoading && cases.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <BookMarked className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No failure cases recorded yet.</p>
                    <button onClick={() => setShowLogCase(true)} className="mt-2 text-xs text-indigo-500 hover:underline">Log the first one</button>
                  </td>
                </tr>
              )}
              {cases.map((c) => (
                <CaseRow key={c._id} c={c} cats={cats}
                  onUpdate={(c) => setEditCase(c)}
                  onDelete={(id) => { if (confirm('Delete this failure case?')) deleteMut.mutate(id); }}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">{meta.total} cases</p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
              <span className="text-xs px-2.5 py-1 text-gray-500">{page}/{meta.pages}</span>
              <button onClick={() => setPage((p) => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCategories && <CategoryModal onClose={() => setShowCategories(false)} />}
      {showLogCase && <LogCaseModal onClose={() => setShowLogCase(false)} />}
      {editCase && <UpdateCasePopover case={editCase} onClose={() => setEditCase(null)} />}
    </div>
  );
}
