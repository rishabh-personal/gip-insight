'use client';

import { Suspense, use } from 'react';
import { JobDetailView } from '@/components/jobs/job-detail-view';
import { PageLoader } from '@/components/ui/loading';

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <JobDetailView jobId={jobId} />
    </Suspense>
  );
}
