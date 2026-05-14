'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/ui/loading';

const ConnectorListView = dynamic(
  () =>
    import('@/components/connectors/connector-list-view').then(
      (m) => m.ConnectorListView,
    ),
  { ssr: false, loading: () => <PageLoader /> },
);

export default function ConnectorsPage() {
  return <ConnectorListView />;
}
