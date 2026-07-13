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

export type DatePreset = 'today' | 'yesterday' | '24h' | '3d' | '7d' | '15d' | '30d';

export function getPresetRange(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (preset === 'yesterday') {
    const yesterday = subDays(now, 1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  }
  const presetMap: Record<Exclude<DatePreset, 'today' | 'yesterday'>, Date> = {
    '24h': subHours(now, 24),
    '3d':  subDays(now, 3),
    '7d':  subDays(now, 7),
    '15d': subDays(now, 15),
    '30d': subDays(now, 30),
  };
  return { from: presetMap[preset], to: now };
}

export function toIso(d: Date): string {
  return d.toISOString();
}

