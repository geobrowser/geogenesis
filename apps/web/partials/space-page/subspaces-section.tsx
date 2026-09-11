'use client';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';
import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SPACE_PILL_CLASS, SpacePillAvatar, SpacePillList, SpacePillSectionHeading } from '~/design-system/space-pill';

type Props = {
  spaceId: string;
  subspaces: TopicUsage[];
};

/**
 * A space's subspaces, in the side panel (GEO-2875).
 *
 * This used to be a three-column card gallery above the editor — the first thing on the page, ahead
 * of what the space is actually about. As pills it keeps the same destinations and the same
 * ordering, in the rail where the other "related things" live.
 *
 * Nothing about the underlying data changes: these are the same subtopic relations the gallery
 * read, still owned by the space's editors. Only where they are drawn moved.
 */
export function SubspacesSection({ spaceId, subspaces }: Props) {
  if (subspaces.length === 0) return null;

  return (
    <section className="flex flex-col">
      <SpacePillSectionHeading>Subspaces</SpacePillSectionHeading>

      <SpacePillList
        items={subspaces}
        keyFor={subspace => subspace.id}
        renderPill={subspace => (
          <Link href={subspaceHref(spaceId, subspace)} className={SPACE_PILL_CLASS}>
            <SpacePillAvatar value={subspaceImage(subspace)} />
            <span className="truncate">{subspace.name}</span>
          </Link>
        )}
      />
    </section>
  );
}

/**
 * Where a pill goes, unchanged from the gallery it replaces: the subspace's own page when the topic
 * is published in one, and the topic entity within this space when it is not.
 *
 * A link rather than a panel-open. GEO-2757 is moving Explore's cards toward opening in the panel,
 * but that is the panel these pills already live in, and a rail that replaces itself on every click
 * would strand the reader with no way back to the list.
 */
function subspaceHref(spaceId: string, subspace: TopicUsage): string {
  const topSpaceId = Spaces.getTopRankedSpaceId(subspace.spaces.map(space => space.id));
  return topSpaceId ? NavUtils.toSpace(topSpaceId) : NavUtils.toEntity(spaceId, subspace.id);
}

/** The topic's own image, falling back to the space that hosts it, then to the placeholder. */
function subspaceImage(subspace: TopicUsage): string {
  return subspace.image || subspace.spaces[0]?.image || PLACEHOLDER_SPACE_IMAGE;
}
