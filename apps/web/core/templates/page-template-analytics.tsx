'use client';

import * as React from 'react';

import { type PageTemplateRenderer, registerPageTemplate } from '~/core/action-context';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { readStoredFeatureFlag, useFeatureFlag } from '~/core/state/feature-flags';

import type { EntityTemplateId } from './registry';

/**
 * Whether an entity page draws its template or the legacy entity page: templates draw only with the
 * `entityTemplatesV2` flag on and outside edit mode (`EntityPageBody`, `PostEntityPageBody`).
 */
export function pageTemplateRenderer(enableV2Templates: boolean, isEditing: boolean): PageTemplateRenderer {
  return enableV2Templates && !isEditing ? 'template' : 'legacy';
}

/**
 * Tells analytics which template drew this entity page, so `page_viewed`, auth events and actions on it
 * carry `page_template` and `page_template_renderer` (see `pageContext()`). Mounted once by the entity
 * layout; the template views themselves stay unaware of it.
 */
export function PageTemplateAnalytics({
  entityId,
  spaceId,
  template,
}: {
  entityId: string;
  spaceId: string;
  template: EntityTemplateId;
}) {
  // Only a dependency: until hydration it reports the flag's default, which a first page view must
  // not be labelled with. The effect reads the stored flag instead (`readStoredFeatureFlag`).
  const enableV2Templates = useFeatureFlag('entityTemplatesV2');
  const isEditing = useUserIsEditing(spaceId);

  // A layout effect, so it is in place before `PageViewTracker` reports the view (a timer after its
  // own effect) and before any click on the page.
  React.useLayoutEffect(
    () =>
      registerPageTemplate({
        entityId,
        template,
        renderer: pageTemplateRenderer(readStoredFeatureFlag('entityTemplatesV2'), isEditing),
      }),
    // `enableV2Templates` re-registers after hydration and when the flags dialog toggles the flag.
    [entityId, template, enableV2Templates, isEditing]
  );

  return null;
}
