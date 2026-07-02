'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useFeatureFlag } from '~/core/state/feature-flags';

type QuestionsPageClientProps = {
  spaceId: string;
};

export function QuestionsPageClient({ spaceId }: QuestionsPageClientProps) {
  const questionsTabEnabled = useFeatureFlag('questionsTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!questionsTabEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [questionsTabEnabled, router, spaceId]);

  if (!questionsTabEnabled) return null;

  return (
    <div className="py-8">
      <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
        <h2 className="text-smallTitle text-text">Questions</h2>
        <p className="mt-2 max-w-[560px] text-body text-grey-04">
          Questions for this space will live here. This preview tab is ready for the next Q&amp;A workflow.
        </p>
      </div>
    </div>
  );
}
