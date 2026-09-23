'use client';

import * as React from 'react';

import { ProfileRecordTabs } from './profile-record-tabs';

/**
 * A person's profile, on the two surfaces that are not their space's home page.
 *
 * The profile was built as a *route*: `/space/<personal space>` assembles it out
 * of three pieces that live in three places — the header and tabs in the space
 * layout, the rail beside it, and the sections in the page body. Anything
 * arriving at the same person by another door got none of it. Clicking a
 * participant in a debate opens the side panel on exactly the pair that route
 * uses — the person entity, in their personal space — and got the generic value
 * sheet, as did the full-page entity route at `/space/<id>/<entity id>`, which
 * sits in its own `(entity)` group and so shares neither the layout nor the rail.
 *
 * **This is the body, not the page.** `EntityPageBody` already draws the cover,
 * avatar, name, roles and bio on both surfaces — an earlier version of this
 * returned early and threw the header away, which is how the panel came to open
 * on a bare Activity card with nothing above it saying whose it was. What is
 * left to supply is the record tabs.
 *
 * **The model is the mobile layout**, deliberately. Below 1024px the space route
 * is already a single column with no rail, its facts moved into an About tab —
 * which is exactly the shape a side panel has, at every width.
 */
export function PersonProfileView({
  entityId,
  spaceId,
  authoredTabs,
}: {
  entityId: string;
  spaceId: string;
  /**
   * The person's own authored tabs, which the space route carries in its header
   * and neither of these surfaces has one for. Rendered inside Overview, since
   * that is the page they belong to.
   */
  authoredTabs?: React.ReactNode;
}) {
  return <ProfileRecordTabs entityId={entityId} spaceId={spaceId} authoredTabs={authoredTabs} />;
}
