'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { cn, getPresetRange, toIso, type DatePreset } from '@/lib/utils';
import { saveDateRange, loadDateRange } from '@/hooks/use-date-range';
import { CalendarDays, Check } from 'lucide-react';

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: '1H',   value: '1h'   },
  { label: '6H',   value: '6h'   },
  { label: '24H',  value: '24h'  },
  { label: '7D',   value: '7d'   },
  { label: '30D',  value: '30d'  },
];

/** Format a UTC ISO string into the value expected by <input type="datetime-local"> (local time) */
function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  // format() uses local timezone automatically
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

export function DateRangeBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePreset = (searchParams.get('preset') as DatePreset) || 'today';
  const isCustom = activePreset === 'custom';

  const [open, setOpen] = useState(false);
  const [fromVal, setFromVal] = useState('');
  const [toVal, setToVal] = useState('');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Restore persisted date range when navigating to a page that has no URL params
  useEffect(() => {
    const urlFrom = searchParams.get('from');
    const urlTo = searchParams.get('to');
    const urlPreset = searchParams.get('preset');

    if (urlFrom && urlTo) {
      // URL has params → persist them so other pages can restore
      saveDateRange(urlPreset || 'custom', urlFrom, urlTo);
    } else {
      // URL is missing params → restore from localStorage (or default to today)
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

  // When opening, pre-fill with current URL values
  const openCustom = () => {
    setFromVal(toLocalDateTimeInput(searchParams.get('from')));
    setToVal(toLocalDateTimeInput(searchParams.get('to') || new Date().toISOString()));
    setError('');
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
    if (!fromVal || !toVal) {
      setError('Both dates are required');
      return;
    }
    const from = new Date(fromVal); // browser interprets as local time → UTC internally
    const to = new Date(toVal);
    if (from >= to) {
      setError('"From" must be before "To"');
      return;
    }
    saveDateRange('custom', from.toISOString(), to.toISOString());
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
    params.set('preset', 'custom');
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1 relative">
      <span className="text-xs text-gray-500 mr-1">Window:</span>

      {/* Preset buttons */}
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => setPreset(p.value)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            !isCustom && activePreset === p.value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {p.label}
        </button>
      ))}

      {/* Custom button */}
      <button
        onClick={openCustom}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
          isCustom
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        )}
      >
        <CalendarDays className="w-3 h-3" />
        {isCustom ? 'Custom ✓' : 'Custom'}
      </button>

      {/* Custom date-time picker panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute top-8 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-72"
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

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={applyCustom}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Check className="w-3 h-3" /> Apply
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
