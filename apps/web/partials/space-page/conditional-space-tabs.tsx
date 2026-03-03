'use client';

import { usePathname } from 'next/navigation';

import { Relation } from '~/core/types';
import { TabEntity } from '~/core/types';

import { SpaceTabs } from './space-tabs';

type Props = {
  spaceId: string;
  entityId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
  typeIds: string[];
};

/**
 * Renders SpaceTabs only when not on the Import page.
 * On /space/[id]/import and /space/[id]/import/review we show the import flow as standalone (no tab bar).
 */
export function ConditionalSpaceTabs(props: Props) {
  const pathname = usePathname();
  const isImportFlow = pathname != null && pathname.includes('/import');

  if (isImportFlow) {
    return null;
  }

  return <SpaceTabs {...props} />;
}
