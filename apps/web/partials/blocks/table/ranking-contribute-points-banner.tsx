'use client';

import { QuestionCircle } from '~/design-system/icons/question-circle';
import { TriangleUpCircle } from '~/design-system/icons/triangle-up-circle';

export function RankingContributePointsBanner() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg bg-[#6833FF33] px-3 py-2.5">
      <TriangleUpCircle />
      <span className="text-[16px] text-purple">
        Earn up to 10 points by contributing<span className="lg:hidden"> to the global rank</span>
      </span>
      <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center bg-transparent" aria-hidden>
        <QuestionCircle color="purple" />
      </span>
    </div>
  );
}
