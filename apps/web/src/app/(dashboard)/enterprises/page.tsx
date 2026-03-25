'use client';

import { Suspense } from 'react';
import { EnterpriseListView } from '@/components/enterprises/enterprise-list-view';

export default function EnterprisesPage() {
  return (
    <Suspense>
      <EnterpriseListView />
    </Suspense>
  );
}
