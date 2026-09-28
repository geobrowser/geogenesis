'use client';

import * as React from 'react';

import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = {
  entityId: string;
  spaceId: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Anything on a profile that names an entity — a company, a role, a degree, a
 * skill (GEO-2859).
 *
 * All of them are entities, and every one is a thread somebody reading a profile
 * will want to pull: who else works there, who else holds this degree, who else
 * knows this. The panel is the right place to answer that, because the question
 * is asked *while* reading the profile and the answer should not cost the page.
 *
 * A real anchor with a real `href`, and only unmodified left clicks are
 * intercepted — the same contract `ExploreCardEntityLink` keeps. Cmd-click,
 * shift-click and middle click must still open the entity page in a new tab,
 * which is how people read a graph; a button with an `onClick` would look
 * identical and break all of them, along with "copy link address".
 *
 * An entity with no id renders as plain text rather than a link to nowhere: a
 * legacy field of study is a string on the relation with no entity behind it.
 */
export function ProfileEntityLink({ entityId, spaceId, className, children }: Props) {
  const { openSidePanel } = useEntitySidePanel();

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (isModifiedClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      // `openedWithMainViewEditing: false` — a profile is read, and the panel
      // has no main-view edit session to return the reader to.
      openSidePanel(entityId, spaceId, false);
    },
    [entityId, spaceId, openSidePanel]
  );

  if (entityId === '') {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link
      href={NavUtils.toEntity(spaceId, entityId)}
      entityId={entityId}
      spaceId={spaceId}
      className={className}
      onClick={onClick}
      // Exempts this from the panel's capture-phase outside-pointerdown close,
      // so clicking a second name while the panel is open switches targets
      // rather than tearing it down and rebuilding it.
      data-entity-side-panel-opener=""
    >
      {children}
    </Link>
  );
}
