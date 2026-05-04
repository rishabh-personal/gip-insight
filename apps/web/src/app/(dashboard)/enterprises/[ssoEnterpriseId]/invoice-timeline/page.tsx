'use client';

import { Suspense, use } from 'react';
import { InvoiceTimelineView } from '@/components/sync-gap/invoice-timeline-view';
import { PageLoader } from '@/components/ui/loading';

export default function InvoiceTimelinePage({
  params,
}: {
  params: Promise<{ ssoEnterpriseId: string }>;
}) {
  const { ssoEnterpriseId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <InvoiceTimelineView ssoEnterpriseId={ssoEnterpriseId} />
    </Suspense>
  );
}
