'use client';

import { Suspense } from 'react';
import { use } from 'react';
import { PageLoader } from '@/components/ui/loading';
import { ConnectorLogsView } from '@/components/enterprises/connector-logs-view';

export default function ConnectorLogsPage({
  params,
}: {
  params: Promise<{ ssoEnterpriseId: string }>;
}) {
  const { ssoEnterpriseId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <ConnectorLogsView ssoEnterpriseId={ssoEnterpriseId} />
    </Suspense>
  );
}
