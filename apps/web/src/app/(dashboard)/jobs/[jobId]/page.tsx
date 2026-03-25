'use client';

import { Suspense } from 'react';
import { JobDetailView } from '@/components/jobs/job-detail-view';
import { use } from 'react';

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return (
    <Suspense>
      <JobDetailView jobId={jobId} />
    </Suspense>
  );
}
