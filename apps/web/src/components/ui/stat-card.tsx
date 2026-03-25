import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  color?: 'default' | 'green' | 'red' | 'yellow' | 'blue';
  className?: string;
}

const colorMap = {
  default: 'text-gray-700',
  green: 'text-green-600',
  red: 'text-red-600',
  yellow: 'text-yellow-600',
  blue: 'text-blue-600',
};

export function StatCard({ label, value, sub, icon: Icon, color = 'default', className }: StatCardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={cn('text-2xl font-bold mt-1', colorMap[color])}>{value ?? '—'}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
