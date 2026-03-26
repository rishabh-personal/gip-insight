'use client';

import { Suspense } from 'react';
import { TraceView } from '@/components/trace/trace-view';
import { PageLoader } from '@/components/ui/loading';

export default function TracePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <TraceView />
    </Suspense>
  );
}
