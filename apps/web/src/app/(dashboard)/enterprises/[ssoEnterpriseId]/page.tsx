'use client';

import { Suspense, use } from 'react';
import { EnterpriseDetailView } from '@/components/enterprises/enterprise-detail-view';
import { PageLoader } from '@/components/ui/loading';

export default function EnterpriseDetailPage({ params }: { params: Promise<{ ssoEnterpriseId: string }> }) {
  const { ssoEnterpriseId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <EnterpriseDetailView ssoEnterpriseId={ssoEnterpriseId} />
    </Suspense>
  );
}
