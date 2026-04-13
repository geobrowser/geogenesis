import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';
import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

interface SubtopicGalleryProps {
  spaceId: string;
  subtopics: TopicUsage[];
}

function getSubtopicCardImage(subtopic: TopicUsage) {
  return subtopic.image || subtopic.spaces[0]?.image || PLACEHOLDER_SPACE_IMAGE;
}

export function SubtopicGallery({ spaceId, subtopics }: SubtopicGalleryProps) {
  if (subtopics.length === 0) {
    return null;
  }

  return (
    <>
      <h4 className="text-mediumTitle font-medium">Subspaces</h4>
      <Spacer height={8} />
      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-2">
        {subtopics.map(subtopic => {
          const topSpaceId = Spaces.getTopRankedSpaceId(subtopic.spaces.map(s => s.id));
          const href = topSpaceId ? NavUtils.toSpace(topSpaceId) : NavUtils.toEntity(spaceId, subtopic.id);

          return (
            <div
              key={subtopic.id}
              className="group flex flex-col gap-3 rounded-[17px] p-1 pb-2 transition duration-200 hover:bg-grey-01"
            >
              <Link href={href}>
                <div className="relative aspect-2/1 w-full overflow-clip rounded-lg bg-grey-01">
                  <GeoImage
                    value={getSubtopicCardImage(subtopic)}
                    className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
                    priority
                    fill
                    alt={subtopic.name}
                  />
                </div>
              </Link>
              <div className="flex w-full flex-col px-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={href} className="min-w-0 grow">
                    <div className="text-smallTitle font-medium text-text">{subtopic.name}</div>
                  </Link>
                  <EntityVoteButtons entityId={subtopic.id} spaceId={spaceId} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Spacer height={40} />
    </>
  );
}
