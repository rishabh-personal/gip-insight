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

