'use client';

import { useSearchParams } from 'next/navigation';

import type { TopQuestionsRankingData } from '~/core/space-home/fetch-top-questions-ranking';

import { Spacer } from '~/design-system/spacer';

import { TopQuestionsRankingGallery } from './top-questions-ranking-gallery';

function TopQuestionsEmptyState() {
  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-mediumTitle font-medium">Top questions</h4>
      <p className="text-browseMenu text-grey-04">
        Add a ranking block on this space overview filtered to Question type to power this section.
      </p>
    </div>
  );
}

export function TopQuestionsSection({ ranking }: { ranking: TopQuestionsRankingData | null }) {
  const searchParams = useSearchParams();

  if (searchParams?.get('tabId')) {
    return null;
  }

  return (
    <>
      {ranking ? <TopQuestionsRankingGallery ranking={ranking} /> : <TopQuestionsEmptyState />}
      <Spacer height={40} />
    </>
  );
}
