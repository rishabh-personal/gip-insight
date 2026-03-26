'use client';

import { Suspense } from 'react';
import { FailedJobsView } from '@/components/jobs/failed-jobs-view';
import { PageLoader } from '@/components/ui/loading';

export default function FailedJobsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <FailedJobsView />
    </Suspense>
  );
}
