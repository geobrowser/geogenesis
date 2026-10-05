import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { SpaceTabLoadingRows } from '~/partials/space-page/space-tab-loading';

/**
 * Loading UI for space tabs that share the tab bar.
 *
 * Without a boundary, a tab click kept the previous content on screen until the server answered.
 * Uses `EntityPageContentContainer` so the skeleton matches the tab content column.
 * `claims` and `debates` are full-bleed and keep their own `loading.tsx`.
 */
export default function SpaceTabLoading() {
  return (
    <EntityPageContentContainer>
      <SpaceTabLoadingRows />
    </EntityPageContentContainer>
  );
}
