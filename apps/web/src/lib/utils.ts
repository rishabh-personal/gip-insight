import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, subHours, subDays, startOfDay, endOfDay } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'dd MMM yyyy, HH:mm');
}

export type DatePreset = 'today' | '1h' | '6h' | '24h' | '7d' | '30d';

export function getPresetRange(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  const presetMap: Record<Exclude<DatePreset, 'today'>, Date> = {
    '1h':  subHours(now, 1),
    '6h':  subHours(now, 6),
    '24h': subHours(now, 24),
    '7d':  subDays(now, 7),
    '30d': subDays(now, 30),
  };
  return { from: presetMap[preset], to: now };
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    success:    'text-green-700 bg-green-50',
    failed:     'text-red-700 bg-red-50',
    pending:    'text-yellow-700 bg-yellow-50',
    processing: 'text-blue-700 bg-blue-50',
    SYNCED:     'text-green-700 bg-green-50',
    PARTIAL:    'text-yellow-700 bg-yellow-50',
    NOT_SYNCED: 'text-red-700 bg-red-50',
    PENDING:    'text-blue-700 bg-blue-50',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}
