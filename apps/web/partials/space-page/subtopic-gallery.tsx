import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Slider } from '~/design-system/slider';
import { Spacer } from '~/design-system/spacer';

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
      <Slider label="Subtopics" labelClassName="text-mediumTitle font-medium">
        {subtopics.map(subtopic => (
          <Link key={subtopic.id} href={NavUtils.toEntity(spaceId, subtopic.id)} className="group">
            <div className="relative aspect-2/1 w-full overflow-clip rounded-[12px] bg-grey-01">
              <GeoImage
                value={getSubtopicCardImage(subtopic)}
                className="transition-transform duration-150 ease-in-out group-hover:scale-105"
                style={{ objectFit: 'cover' }}
                priority
                fill
                alt={subtopic.name}
              />
            </div>
            <div className="mt-3 px-1.5 text-smallTitle font-medium text-text">{subtopic.name}</div>
          </Link>
        ))}
      </Slider>
      <Spacer height={40} />
    </>
  );
}
