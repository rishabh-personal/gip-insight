'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn, getPresetRange, toIso, type DatePreset } from '@/lib/utils';

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
];

export function DateRangeBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get('preset') as DatePreset) || '24h';

  const setPreset = (preset: DatePreset) => {
    const { from, to } = getPresetRange(preset);
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', toIso(from));
    params.set('to', toIso(to));
    params.set('preset', preset);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 mr-1">Window:</span>
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => setPreset(p.value)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            active === p.value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
