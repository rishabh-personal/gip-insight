'use client';

import { Suspense } from 'react';
import { FailedJobsView } from '@/components/jobs/failed-jobs-view';

export default function FailedJobsPage() {
  return (
    <Suspense>
      <FailedJobsView />
    </Suspense>
  );
}
