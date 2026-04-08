'use client';

import { Suspense } from 'react';
import { PageLoader } from '@/components/ui/loading';
import { FailureAnalysisView } from '@/components/failure-analysis/failure-analysis-view';

export default function FailureAnalysisPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <FailureAnalysisView />
    </Suspense>
  );
}
