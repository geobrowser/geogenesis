import { fetchSidebarCounts } from '~/core/io/fetch-sidebar-counts';

import { GovernanceHomeSidebar } from './governance-home-sidebar';

export async function GovernanceHomeSidebarCounts({ memberSpaceId }: { memberSpaceId: string }) {
  const counts = await fetchSidebarCounts(memberSpaceId);
  return <GovernanceHomeSidebar counts={counts} />;
}
