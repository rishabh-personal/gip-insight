'use client';

import { Suspense } from 'react';
import { EnterpriseListView } from '@/components/enterprises/enterprise-list-view';
import { PageLoader } from '@/components/ui/loading';

export default function EnterprisesPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EnterpriseListView />
    </Suspense>
  );
}
