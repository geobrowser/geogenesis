import { fetchTopQuestionsRanking } from '~/core/space-home/fetch-top-questions-ranking';

import { TopQuestionsSection } from '~/partials/space-page/top-questions/top-questions-section';

export async function TopQuestionsSectionContainer({ spaceId }: { spaceId: string }) {
  const ranking = await fetchTopQuestionsRanking(spaceId);

  return <TopQuestionsSection ranking={ranking} />;
}
