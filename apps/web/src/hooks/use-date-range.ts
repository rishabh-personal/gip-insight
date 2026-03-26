'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPresetRange, toIso, type DatePreset } from '@/lib/utils';

const STORAGE_KEY = 'gip-date-range';

export interface StoredDateRange {
  preset: string;
  from: string;
  to: string;
}

export function saveDateRange(preset: string, from: string, to: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset, from, to }));
  } catch {
    // ignore — localStorage may be unavailable (SSR, private mode)
  }
}

export function loadDateRange(): StoredDateRange | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDateRange;
  } catch {
    return null;
  }
}

/** Returns today's default from/to as ISO strings. */
function todayRange() {
  const { from, to } = getPresetRange('today' as DatePreset);
  return { from: toIso(from), to: toIso(to) };
}

/**
 * Returns stable `from` / `to` ISO strings by checking, in order:
 *   1. URL search params (`?from=...&to=...`)
 *   2. localStorage (persisted from previous selection)
 *   3. Today's date range as the final default
 */
export function useDateRange() {
  const searchParams = useSearchParams();

  const from = useMemo(() => {
    const urlVal = searchParams.get('from');
    if (urlVal) return urlVal;
    const saved = loadDateRange();
    if (saved?.from) return saved.from;
    return todayRange().from;
  }, [searchParams]);

  const to = useMemo(() => {
    const urlVal = searchParams.get('to');
    if (urlVal) return urlVal;
    const saved = loadDateRange();
    if (saved?.to) return saved.to;
    return todayRange().to;
  }, [searchParams]);

  return { from, to };
}
