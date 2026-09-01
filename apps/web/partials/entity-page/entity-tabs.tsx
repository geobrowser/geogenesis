'use client';

import * as React from 'react';

import { useEditable } from '~/core/state/editable-store';
import { EntitySidePanelEditContext } from '~/core/state/entity-side-panel-edit-context';
import { useQueryEntity } from '~/core/sync/use-store';
import { TabEntity } from '~/core/types';
import { Relation } from '~/core/types';
import { entityHasOnlyPostType } from '~/core/utils/entity/entities';
import { NavUtils } from '~/core/utils/utils';

import { TabGroup } from '~/design-system/tab-group';

import { EditableTabGroup } from './editable-tab-group';
import { entityTabLinks, useEntityTabEntities } from './use-entity-tab-entities';

type EntityTabsProps = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
};

export function EntityTabs({ entityId, spaceId, initialTabRelations, tabEntities }: EntityTabsProps) {
  const { editable } = useEditable();
  const { entity } = useQueryEntity({ id: entityId, spaceId });
  const sidePanelEdit = React.useContext(EntitySidePanelEditContext);

  /**
   * Full entity page: same as before — only global edit toggle (`editable`).
   * Side panel: only `panelWantsEdit` (how the panel was opened + toggle). Do **not** OR with
   * global `editable`, or a leftover edit mode elsewhere forces EditableTabGroup and tabs show
   * even when the panel is in view mode.
   */
  const effectiveEditable = sidePanelEdit != null ? sidePanelEdit.panelWantsEdit : editable;

  const { tabRelations: sortedTabRelations, tabs: sortedTabEntities } = useEntityTabEntities({
    entityId,
    spaceId,
    initialTabRelations,
    tabEntities,
  });

  if (entityHasOnlyPostType(entity)) {
    return null;
  }

  const allTabs = entityTabLinks({ spaceId, entityId, tabs: sortedTabEntities });
  const [overviewLink] = allTabs;
  const overviewHref = overviewLink.href;

  if (effectiveEditable) {
    const editableTabs = sortedTabRelations.map((relation, i) => ({
      relation,
      entityId: sortedTabEntities[i].id,
      name: sortedTabEntities[i].name ?? '',
      href: NavUtils.toEntity(spaceId, entityId, undefined, undefined, { tabId: sortedTabEntities[i].id }),
    }));

    return (
      <EditableTabGroup
        entityId={entityId}
        spaceId={spaceId}
        editableTabs={editableTabs}
        systemTabsBefore={[overviewLink]}
        overviewHref={overviewHref}
      />
    );
  }

  if (allTabs.length <= 1) {
    return null;
  }

  return <TabGroup tabs={allTabs} />;
}
