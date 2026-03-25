'use client';

import { Suspense } from 'react';
import { EnterpriseDetailView } from '@/components/enterprises/enterprise-detail-view';
import { use } from 'react';

export default function EnterpriseDetailPage({ params }: { params: Promise<{ ssoEnterpriseId: string }> }) {
  const { ssoEnterpriseId } = use(params);
  return (
    <Suspense>
      <EnterpriseDetailView ssoEnterpriseId={ssoEnterpriseId} />
    </Suspense>
  );
}
