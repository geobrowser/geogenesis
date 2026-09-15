'use client';

import { COVERAGE_TYPE_IDS } from '../ontology';
import { TopicExploreSection, type TopicSectionMode } from './topic-explore-section';

/**
 * Everything published elsewhere that names this topic — episodes, news stories, tweets, official
 * documents, papers.
 *
 * Nine types in one bucket rather than a section each: they are the same thing to a reader, and
 * split out they dominated the page while saying nothing the others didn't. Claims are the
 * exception and have their own tab, because they are the only rows a reader can act on rather than
 * read.
 */
export function TopicCoverage({
  topicId,
  spaceId,
  mode,
  viewAllSlot,
}: {
  topicId: string;
  spaceId: string;
  mode: TopicSectionMode;
  viewAllSlot?: React.ReactNode;
}) {
  return (
    <TopicExploreSection
      topicId={topicId}
      spaceId={spaceId}
      typeIds={COVERAGE_TYPE_IDS}
      label="Coverage"
      mode={mode}
      viewAllSlot={viewAllSlot}
    />
  );
}
