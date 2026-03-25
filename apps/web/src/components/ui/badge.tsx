import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'muted';
  className?: string;
}

const variantMap = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-50 text-green-700 border border-green-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  warning: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  muted: 'bg-gray-50 text-gray-500 border border-gray-200',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        variantMap[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
