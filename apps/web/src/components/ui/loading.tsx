import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600',
        className || 'w-5 h-5',
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner className="w-8 h-8" />
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <p className="text-sm">{message || 'Failed to load data'}</p>
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
      <p className="text-sm">{message || 'No data found'}</p>
    </div>
  );
}
