'use client';

import { Suspense } from 'react';
import { SyncGapView } from '@/components/sync-gap/sync-gap-view';
import { use } from 'react';

export default function SyncGapPage({ params }: { params: Promise<{ ssoEnterpriseId: string }> }) {
  const { ssoEnterpriseId } = use(params);
  return (
    <Suspense>
      <SyncGapView ssoEnterpriseId={ssoEnterpriseId} />
    </Suspense>
  );
}
