'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useRef, useState, useEffect, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { cn, getPresetRange, toIso, type DatePreset } from '@/lib/utils';
import { saveDateRange, loadDateRange } from '@/hooks/use-date-range';
import { CalendarDays, Check } from 'lucide-react';

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today',     value: 'today'     },
  { label: 'Yesterday', value: 'yesterday' },
  { label: '1H',        value: '1h'        },
  { label: '6H',        value: '6h'        },
  { label: '24H',       value: '24h'       },
  { label: '7D',        value: '7d'        },
  { label: '30D',       value: '30d'       },
];

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

interface DateRangeBarProps {
  /** When true, remove the "Window:" label (saves space on mobile row) */
  compact?: boolean;
}

export function DateRangeBar({ compact }: DateRangeBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePreset = (searchParams.get('preset') as DatePreset | 'custom') || 'today';
  const isCustom = activePreset === 'custom';

  const [open, setOpen] = useState(false);
  const [fromVal, setFromVal] = useState('');
  const [toVal, setToVal] = useState('');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const customBtnRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const urlFrom = searchParams.get('from');
    const urlTo = searchParams.get('to');
    const urlPreset = searchParams.get('preset');

    if (urlFrom && urlTo) {
      saveDateRange(urlPreset || 'custom', urlFrom, urlTo);
    } else {
      const saved = loadDateRange();
      const params = new URLSearchParams(searchParams.toString());
      if (saved) {
        params.set('from', saved.from);
        params.set('to', saved.to);
        params.set('preset', saved.preset);
      } else {
        const { from, to } = getPresetRange('today');
        const fromIso = toIso(from);
        const toIso_ = toIso(to);
        saveDateRange('today', fromIso, toIso_);
        params.set('from', fromIso);
        params.set('to', toIso_);
        params.set('preset', 'today');
      }
      router.replace(`${pathname}?${params.toString()}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const openCustom = () => {
    // Compute fixed position from the button so the panel escapes any
    // overflow:auto ancestor (e.g. the mobile horizontal scroll row).
    if (customBtnRef.current) {
      const rect = customBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const panelHeight = 260; // approximate panel height
      if (spaceBelow >= panelHeight) {
        setPanelStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      } else {
        setPanelStyle({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right });
      }
    }
    setFromVal(toLocalDateTimeInput(searchParams.get('from')));
    setToVal(toLocalDateTimeInput(searchParams.get('to') || new Date().toISOString()));
    setError('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const setPreset = (preset: DatePreset) => {
    setOpen(false);
    const { from, to } = getPresetRange(preset);
    const fromIso = toIso(from);
    const toIso_ = toIso(to);
    saveDateRange(preset, fromIso, toIso_);
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', fromIso);
    params.set('to', toIso_);
    params.set('preset', preset);
    router.push(`${pathname}?${params.toString()}`);
  };

  const applyCustom = () => {
    if (!fromVal || !toVal) { setError('Both dates are required'); return; }
    const from = new Date(fromVal);
    const to = new Date(toVal);
    if (from >= to) { setError('"From" must be before "To"'); return; }
    saveDateRange('custom', from.toISOString(), to.toISOString());
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
    params.set('preset', 'custom');
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  };

  return (
    /* Outer wrapper: flex row, no-shrink on buttons, scrollable parent handles overflow */
    <div className="flex items-center gap-1 relative">
      {!compact && <span className="text-xs text-gray-500 mr-1 whitespace-nowrap">Window:</span>}

      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => setPreset(p.value)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap touch-manipulation',
            !isCustom && activePreset === p.value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {p.label}
        </button>
      ))}

      {/* Custom picker button */}
      <button
        ref={customBtnRef}
        onClick={openCustom}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap touch-manipulation',
          isCustom ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        )}
      >
        <CalendarDays className="w-3 h-3" />
        {isCustom ? '✓' : 'Custom'}
      </button>

      {/* Custom date-time picker panel — fixed so it escapes overflow:auto on mobile */}
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-72"
        >
          <p className="text-xs font-semibold text-gray-700 mb-3">Custom range</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="datetime-local"
                value={fromVal}
                onChange={(e) => { setFromVal(e.target.value); setError(''); }}
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="datetime-local"
                value={toVal}
                onChange={(e) => { setToVal(e.target.value); setError(''); }}
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={applyCustom}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors touch-manipulation"
              >
                <Check className="w-3 h-3" /> Apply
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
