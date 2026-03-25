import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, subHours, subDays } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'dd MMM yyyy, HH:mm');
}

export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'dd MMM HH:mm');
}

export type DatePreset = '1h' | '6h' | '24h' | '7d' | '30d';

export function getPresetRange(preset: DatePreset): { from: Date; to: Date } {
  const to = new Date();
  const presetMap: Record<DatePreset, Date> = {
    '1h': subHours(to, 1),
    '6h': subHours(to, 6),
    '24h': subHours(to, 24),
    '7d': subDays(to, 7),
    '30d': subDays(to, 30),
  };
  return { from: presetMap[preset], to };
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function healthColor(health: string) {
  if (health === 'green') return 'text-green-600 bg-green-50 border-green-200';
  if (health === 'yellow') return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

export function statusColor(status: string) {
  const map: Record<string, string> = {
    success: 'text-green-700 bg-green-50',
    failed: 'text-red-700 bg-red-50',
    pending: 'text-yellow-700 bg-yellow-50',
    processing: 'text-blue-700 bg-blue-50',
    SYNCED: 'text-green-700 bg-green-50',
    PARTIAL: 'text-yellow-700 bg-yellow-50',
    NOT_SYNCED: 'text-red-700 bg-red-50',
    PENDING: 'text-blue-700 bg-blue-50',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}

export function pct(val: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((val / total) * 100)}%`;
}
