import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

export function AccretionDashboardCard({ spaceId }: { spaceId: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-grey-02 bg-white">
      <div className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-purple" aria-hidden />
            <p className="text-[14px] leading-[18px] font-medium tracking-[-0.2px] text-purple">Allocation health</p>
          </div>
          <h2 className="text-[24px] leading-[29px] font-semibold tracking-[-0.75px] text-[#2A2B2E]">
            Accretion dashboard
          </h2>
          <p className="mt-2 text-[16px] leading-[23px] text-grey-04">
            See whether this space turns bounty spending into accepted, additive graph output.
          </p>
        </div>
        <Link
          href={NavUtils.toCommunityAccretion(spaceId)}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#2A2B2E] px-4 py-2.5 text-[16px] leading-[20px] font-medium text-white hover:bg-black"
        >
          View dashboard
        </Link>
      </div>
    </section>
  );
}
