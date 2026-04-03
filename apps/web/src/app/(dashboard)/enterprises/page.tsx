'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/ui/loading';

// Disable SSR — EnterpriseListView uses localStorage extensively for persisted state
// (connector tabs, date range, labels). Rendering on the server would produce empty
// state that mismatches the client, causing React hydration errors and full-page reloads.
const EnterpriseListView = dynamic(
  () => import('@/components/enterprises/enterprise-list-view').then((m) => m.EnterpriseListView),
  { ssr: false, loading: () => <PageLoader /> },
);

export default function EnterprisesPage() {
  return <EnterpriseListView />;
}
