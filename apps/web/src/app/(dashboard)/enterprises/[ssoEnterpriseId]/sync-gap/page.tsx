'use client';

import { Suspense, use } from 'react';
import { SyncGapView } from '@/components/sync-gap/sync-gap-view';
import { PageLoader } from '@/components/ui/loading';

export default function SyncGapPage({ params }: { params: Promise<{ ssoEnterpriseId: string }> }) {
  const { ssoEnterpriseId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <SyncGapView ssoEnterpriseId={ssoEnterpriseId} />
    </Suspense>
  );
}
