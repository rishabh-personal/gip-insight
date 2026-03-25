'use client';

import { Suspense } from 'react';
import { TraceView } from '@/components/trace/trace-view';

export default function TracePage() {
  return (
    <Suspense>
      <TraceView />
    </Suspense>
  );
}
