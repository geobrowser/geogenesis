'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import {
  ACCRETION_PERIOD_OPTIONS,
  type AccretionCoverage,
  type AccretionDashboardResult,
  type AccretionPeriod,
} from '~/core/community/accretion-types';
import { NavUtils } from '~/core/utils/utils';

import { InfoSmall } from '~/design-system/icons/info-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { SingleSelectPill } from './community-filter-pill';

const INK = 'text-[#2A2B2E]';
const PANEL_CLASS = 'rounded-xl border border-grey-02 bg-white p-5';

function formatCompact(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('en', {
    notation: Math.abs(value) >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits,
  }).format(value);
}

function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value);
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className={cx(PANEL_CLASS, 'min-w-0')}>
      <p className="text-[14px] leading-[18px] text-grey-04">{label}</p>
      <p className={cx('mt-2 text-[30px] leading-[34px] font-semibold tracking-[-1px] tabular-nums', INK)}>{value}</p>
      <p className="mt-2 text-[13px] leading-[18px] text-grey-04">{detail}</p>
    </div>
  );
}

function PanelHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className={cx('text-[19px] leading-[24px] font-semibold tracking-[-0.35px]', INK)}>{title}</h2>
      <p className="mt-1 text-[14px] leading-[20px] text-grey-04">{description}</p>
    </div>
  );
}

function EmptyMetric({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg bg-grey-01 px-6 text-center text-[14px] leading-[20px] text-grey-04">
      {children}
    </div>
  );
}

function UnitCostDeck({ data }: { data: AccretionDashboardResult }) {
  return (
    <section className={PANEL_CLASS}>
      <PanelHeader
        title="Unit cost deck"
        description="Median nominal payout allocated to each accepted artifact type."
      />
      {data.unitCosts.length === 0 ? (
        <EmptyMetric>No fully linked payout and proposal-diff samples are available for this period.</EmptyMetric>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-grey-02 text-[13px] leading-[18px] text-grey-04">
                <th className="pb-3 font-normal">Artifact type</th>
                <th className="pb-3 text-right font-normal">Artifacts</th>
                <th className="pb-3 text-right font-normal">Proposals</th>
                <th className="pb-3 text-right font-normal">Median unit cost</th>
              </tr>
            </thead>
            <tbody>
              {data.unitCosts.slice(0, 8).map(row => (
                <tr key={row.typeId ?? row.typeName} className="border-b border-grey-02 last:border-0">
                  <td className={cx('py-3 text-[15px] leading-[20px] font-medium', INK)}>{row.typeName}</td>
                  <td className="py-3 text-right text-[15px] leading-[20px] text-grey-04 tabular-nums">
                    {formatCompact(row.rawUnits, 0)}
                  </td>
                  <td className="py-3 text-right text-[15px] leading-[20px] text-grey-04 tabular-nums">
                    {formatCompact(row.proposalSamples, 0)}
                  </td>
                  <td className={cx('py-3 text-right text-[15px] leading-[20px] font-medium tabular-nums', INK)}>
                    {formatDecimal(row.medianUnitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RetroactiveRoi({ data }: { data: AccretionDashboardResult }) {
  const roi = data.summary.retroactiveRoi;
  const width = roi === null ? 0 : Math.min(100, roi * 50);
  return (
    <section className={PANEL_CLASS}>
      <PanelHeader
        title="Retroactive ROI"
        description="Modeled replacement-cost value divided by observed payout volume."
      />
      {roi === null ? (
        <EmptyMetric>ROI appears when payout-linked proposal outputs can be classified.</EmptyMetric>
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <p className={cx('text-[42px] leading-[44px] font-semibold tracking-[-1.5px] tabular-nums', INK)}>
              {formatDecimal(roi)}×
            </p>
            <p className="pb-1 text-right text-[13px] leading-[18px] text-grey-04">
              {formatCompact(data.summary.replacementValue)} modeled value
              <br />
              {formatCompact(data.summary.modeledPayoutAmount)} classified payout volume
            </p>
          </div>
          <div className="relative mt-6 h-2 overflow-hidden rounded-full bg-grey-02">
            <div className="absolute inset-y-0 left-0 rounded-full bg-purple" style={{ width: `${width}%` }} />
            <div className="absolute inset-y-[-3px] left-1/2 w-px bg-[#2A2B2E]" aria-hidden />
          </div>
          <div className="mt-2 flex justify-between text-[12px] leading-[16px] text-grey-04">
            <span>0×</span>
            <span>1× accretive threshold</span>
            <span>2×+</span>
          </div>
        </>
      )}
    </section>
  );
}

function AbsorptionCurve({ data }: { data: AccretionDashboardResult }) {
  const maxCount = Math.max(1, ...data.timeline.flatMap(point => [point.bountiesPosted, point.bountiesDelivered]));
  return (
    <section className={cx(PANEL_CLASS, 'lg:col-span-2')}>
      <PanelHeader
        title="Absorption curve"
        description="Bounties posted versus bounties with accepted work over time."
      />
      {data.timeline.length === 0 ? (
        <EmptyMetric>No bounty activity is available for this period.</EmptyMetric>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[560px] items-end gap-3 pt-4">
            {data.timeline.map(point => (
              <div key={point.key} className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex h-36 w-full items-end justify-center gap-1.5">
                  <div
                    title={`${point.bountiesPosted} posted`}
                    className="w-[38%] rounded-t bg-grey-02"
                    style={{ height: `${Math.max(4, (point.bountiesPosted / maxCount) * 100)}%` }}
                  />
                  <div
                    title={`${point.bountiesDelivered} delivered`}
                    className="w-[38%] rounded-t bg-purple"
                    style={{ height: `${Math.max(4, (point.bountiesDelivered / maxCount) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 truncate text-[12px] leading-[16px] text-grey-04">{point.label}</p>
                <p className="mt-0.5 truncate text-[11px] leading-[14px] text-grey-04">
                  {point.payoutAmount > 0 ? `${formatCompact(point.payoutAmount)} paid` : '—'}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-5 text-[12px] leading-[16px] text-grey-04">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm bg-grey-02" /> Posted
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm bg-purple" /> Accepted
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function CuratorCohorts({ data }: { data: AccretionDashboardResult }) {
  return (
    <section className={PANEL_CLASS}>
      <PanelHeader
        title="Spend-to-output by curator"
        description="Provisional attribution until direct payout recipients are populated."
      />
      {data.curatorCohorts.length === 0 ? (
        <EmptyMetric>No attributable payout cohorts are available for this period.</EmptyMetric>
      ) : (
        <div className="space-y-3">
          {data.curatorCohorts.slice(0, 6).map(row => (
            <div
              key={row.curatorId}
              className="flex items-center justify-between gap-4 border-b border-grey-02 pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className={cx('truncate text-[15px] leading-[20px] font-medium', INK)}>{row.name}</p>
                <p className="text-[12px] leading-[16px] text-grey-04">
                  {formatCompact(row.payoutAmount)} paid · {formatCompact(row.outputUnits)} output units
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cx('text-[15px] leading-[20px] font-medium tabular-nums', INK)}>
                  {row.efficiency === null ? '—' : `${formatDecimal(row.efficiency)}×`}
                </p>
                <p className="text-[11px] leading-[14px] text-grey-04">{row.inferred ? 'inferred' : 'direct'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DeclaredVsDelivered({ data }: { data: AccretionDashboardResult }) {
  const maximum = Math.max(1, data.delivery[0]?.count ?? 0);
  return (
    <section className={PANEL_CLASS}>
      <PanelHeader
        title="Declared versus delivered"
        description="The forward-book funnel for bounties published during this period."
      />
      <div className="space-y-3">
        {data.delivery.map(stage => (
          <div key={stage.key}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px] leading-[17px]">
              <span className={INK}>{stage.label}</span>
              <span className="text-grey-04 tabular-nums">{stage.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-grey-01">
              <div
                className={cx('h-full rounded-full', stage.key === 'posted' ? 'bg-[#2A2B2E]' : 'bg-purple')}
                style={{ width: `${Math.max(stage.count > 0 ? 2 : 0, (stage.count / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DuplicationCheck({ data }: { data: AccretionDashboardResult }) {
  const rows = [
    { label: 'Native entities', value: data.duplication.native, color: 'bg-purple' },
    { label: 'Existing entities reused', value: data.duplication.reused, color: 'bg-[#2A2B2E]' },
    { label: 'Unknown', value: data.duplication.unknown, color: 'bg-grey-03' },
  ];
  const total = Math.max(
    1,
    rows.reduce((sum, row) => sum + row.value, 0)
  );
  return (
    <section className={PANEL_CLASS}>
      <PanelHeader
        title="Duplication check"
        description="Exact entity creation versus useful work on entities that already existed."
      />
      {total === 1 && rows.every(row => row.value === 0) ? (
        <EmptyMetric>No proposal output has been classified for this period.</EmptyMetric>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-grey-01">
            {rows.map(row =>
              row.value > 0 ? (
                <div key={row.label} className={row.color} style={{ width: `${(row.value / total) * 100}%` }} />
              ) : null
            )}
          </div>
          <div className="mt-5 space-y-3">
            {rows.map(row => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-[14px] leading-[19px]">
                <span className="flex items-center gap-2 text-grey-04">
                  <span className={cx('size-2.5 rounded-sm', row.color)} /> {row.label}
                </span>
                <span className={cx('font-medium tabular-nums', INK)}>
                  {row.value} · {formatDecimal((row.value / total) * 100, 0)}%
                </span>
              </div>
            ))}
          </div>
          {data.duplication.unclassifiedProposals > 0 ? (
            <p className="mt-4 text-[12px] leading-[17px] text-grey-04">
              {data.duplication.unclassifiedProposals} accepted proposals are outside the current diff sample.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function coverageRatio(part: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function DataCoverage({ coverage, warnings }: { coverage: AccretionCoverage; warnings: string[] }) {
  const items = [
    { label: 'Bounty budgets', value: coverageRatio(coverage.bountiesWithBudget, coverage.bounties) },
    { label: 'Bounty statuses', value: coverageRatio(coverage.bountiesWithStatus, coverage.bounties) },
    { label: 'Deadlines', value: coverageRatio(coverage.bountiesWithDeadline, coverage.bounties) },
    { label: 'Payout amounts', value: coverageRatio(coverage.payoutsWithAmount, coverage.payouts) },
    { label: 'Direct recipients', value: coverageRatio(coverage.payoutsWithRecipient, coverage.payouts) },
    {
      label: 'Proposal outputs',
      value: coverageRatio(coverage.classifiedProposals, coverage.acceptedProposals),
    },
  ];

  return (
    <section className={PANEL_CLASS}>
      <PanelHeader title="Data coverage" description="What is observed, missing, or sampled in this result." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg bg-grey-01 px-3 py-3">
            <p className="text-[12px] leading-[16px] text-grey-04">{item.label}</p>
            <p className={cx('mt-1 text-[18px] leading-[22px] font-semibold tabular-nums', INK)}>{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-2">
        {warnings.map(warning => (
          <p key={warning} className="flex items-start gap-2 text-[12px] leading-[18px] text-grey-04">
            <span className="mt-0.5 shrink-0 text-grey-04">
              <InfoSmall />
            </span>
            {warning}
          </p>
        ))}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function AccretionDashboard({
  spaceId,
  initialData,
}: {
  spaceId: string;
  initialData?: AccretionDashboardResult;
}) {
  const [period, setPeriod] = React.useState<AccretionPeriod>('year');
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['accretion-dashboard', spaceId, period],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      const response = await fetch(`/api/space/${spaceId}/accretion?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load accretion dashboard');
      return (await response.json()) as AccretionDashboardResult;
    },
    initialData,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return (
    <div className="min-w-0 pb-10">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link
            href={NavUtils.toCommunity(spaceId)}
            className="text-[14px] leading-[18px] text-grey-04 hover:underline"
          >
            Community
          </Link>
          <h1 className={cx('mt-2 text-[30px] leading-[35px] font-semibold tracking-[-1px]', INK)}>
            Accretion dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-[16px] leading-[23px] text-grey-04">
            Is this space allocating bounty spending into accepted, additive graph output?
          </p>
        </div>
        <SingleSelectPill value={period} options={ACCRETION_PERIOD_OPTIONS} onChange={setPeriod} />
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-purple/20 bg-purple/5 p-4">
        <span className="mt-1 size-2 shrink-0 rounded-full bg-purple" aria-hidden />
        <p className="text-[13px] leading-[19px] text-grey-04">
          These metrics inform governance and allocation choices only. Payment remains a separate, human-adjudicated
          clearing decision.
        </p>
      </div>

      {isPending ? <DashboardSkeleton /> : null}

      {isError ? (
        <div className="rounded-xl border border-grey-02 bg-white px-6 py-14 text-center">
          <p className={cx('text-[16px] leading-[22px] font-medium', INK)}>Could not load the dashboard.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-lg border border-grey-02 px-4 py-2 text-[14px] leading-[18px] text-[#2A2B2E] hover:bg-grey-01"
          >
            Try again
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Payout volume"
              value={formatCompact(data.summary.payoutAmount)}
              detail="Nominal amount; currency normalization pending"
            />
            <MetricCard
              label="Accepted proposals"
              value={formatCompact(data.summary.acceptedProposals, 0)}
              detail={`${formatCompact(data.summary.bountiesPosted, 0)} bounties posted`}
            />
            <MetricCard
              label="Accepted artifacts"
              value={formatCompact(data.summary.acceptedArtifacts, 0)}
              detail={`${formatCompact(data.summary.weightedOutputUnits)} weighted output units`}
            />
            <MetricCard
              label="Retroactive ROI"
              value={data.summary.retroactiveRoi === null ? '—' : `${formatDecimal(data.summary.retroactiveRoi)}×`}
              detail={`Methodology ${data.methodologyVersion}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <UnitCostDeck data={data} />
            <RetroactiveRoi data={data} />
            <AbsorptionCurve data={data} />
            <CuratorCohorts data={data} />
            <DeclaredVsDelivered data={data} />
            <DuplicationCheck data={data} />
          </div>

          <DataCoverage coverage={data.coverage} warnings={data.warnings} />
          <p className="text-right text-[11px] leading-[15px] text-grey-04">
            As of {new Date(data.asOf).toLocaleString()} · {data.methodologyVersion}
          </p>
        </div>
      ) : null}
    </div>
  );
}
