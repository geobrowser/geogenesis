'use client';

import * as React from 'react';

import {
  type ClaimSummaryModel,
  ENTITY_TEMPLATE_REGISTRY,
  type EntityListSectionModel,
  type SplitBreakdown,
  type VoteChoice,
  computeSplitGap,
  isClaimSplit,
} from '~/core/templates';
import {
  ClaimSummaryCard,
  RelatedListSection,
  SourceChipList,
  TemplateBadge,
  TemplateShell,
  VoteBox,
} from '~/core/templates/primitives';

/**
 * Interactive Phase 1 sandbox for the template registry and shared UI primitives.
 *
 * Uses pure view-model objects (no backend calls) so designers and engineers can verify
 * spacing, container-query responsiveness, and interactive voting states in isolation.
 */
export function DevTemplatesPreview() {
  const [userVote, setUserVote] = React.useState<VoteChoice>(null);
  const [lastSelected, setLastSelected] = React.useState<string | null>(null);

  const baseAllPercent = 52;
  const baseVotes = 2418;
  const effectiveVotes = baseVotes + (userVote ? 1 : 0);
  const effectiveAll =
    userVote === 'agree'
      ? Math.round(((baseAllPercent * baseVotes) / 100 + 1) / (effectiveVotes / 100))
      : userVote === 'disagree'
        ? Math.round((baseAllPercent * baseVotes) / 100 / (effectiveVotes / 100))
        : baseAllPercent;

  const liveSplit: SplitBreakdown = React.useMemo(() => {
    const rows = [
      { id: 'c1', label: 'Community A', color: '#e07a1f', percent: 94, voterCount: 1180 },
      { id: 'c2', label: 'Community B', color: '#1f8fa3', percent: 6, voterCount: 1090 },
      {
        id: 'all',
        label: 'Everyone',
        color: '#202020',
        percent: effectiveAll,
        voterCount: effectiveVotes,
        isEveryone: true,
        userLabel: userVote ? `You: ${userVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined,
      },
    ];
    const gapPoints = computeSplitGap(rows);
    return { rows, gapPoints, isSplit: isClaimSplit(gapPoints), totalVotes: effectiveVotes };
  }, [effectiveAll, effectiveVotes, userVote]);

  const leadClaim: ClaimSummaryModel = {
    id: 'demo-contested',
    title: 'Sample contested claim rendered with shared primitives',
    kind: 'judgment',
    split: liveSplit,
    overallPercent: effectiveAll,
    meta: [`${effectiveVotes.toLocaleString('en-US')} votes`, '7 debates'],
    userVote,
    onSelect: () => setLastSelected('Opened contested claim'),
  };

  const agreedClaim: ClaimSummaryModel = {
    id: 'demo-agreed',
    title: 'Sample agreed claim where communities converge',
    kind: 'fact',
    basisSummary: 'Both communities cite the same primary dataset.',
    split: {
      isSplit: false,
      gapPoints: 6,
      totalVotes: 1620,
      rows: [
        { id: 'c1', label: 'Community A', color: '#e07a1f', percent: 96 },
        { id: 'c2', label: 'Community B', color: '#1f8fa3', percent: 90 },
      ],
    },
    onSelect: () => setLastSelected('Opened agreed claim'),
  };

  const homogeneousSources: EntityListSectionModel = {
    id: 'sources',
    title: 'Sources (homogeneous — badges suppressed)',
    items: [
      {
        id: 'src-1',
        kind: 'source',
        kindLabel: 'Source',
        title: 'Primary satellite damage assessment',
        meta: 'Primary institution · Jun 2026 · Report',
        onSelect: () => setLastSelected('Opened source 1'),
      },
      {
        id: 'src-2',
        kind: 'source',
        kindLabel: 'Source',
        title: 'Independent panel interim review',
        meta: 'Review committee · Aug 2025 · Report',
        onSelect: () => setLastSelected('Opened source 2'),
      },
    ],
    action: { label: '+ Add a source', onClick: () => setLastSelected('Clicked + Add a source') },
  };

  const mixedCitations: EntityListSectionModel = {
    id: 'cited-by',
    title: 'Cited by (mixed — badges shown)',
    items: [
      {
        id: 'ev-1',
        kind: 'event',
        kindLabel: 'Event',
        title: 'Key milestone event on timeline',
        meta: '13 Oct 2025 · 2 news stories',
        onSelect: () => setLastSelected('Opened event'),
      },
      {
        id: 'st-1',
        kind: 'news-story',
        kindLabel: 'News',
        title: 'Major outlet reporting on the milestone',
        meta: 'Newsroom · 14 Oct 2025',
        onSelect: () => setLastSelected('Opened story'),
      },
    ],
  };

  return (
    <TemplateShell
      maxWidth={900}
      breadcrumbs={[
        { id: 'dev', label: 'Dev previews' },
        { id: 'templates', label: 'Entity templates (Phase 1)' },
      ]}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TemplateBadge tone="dark">Phase 1 foundation</TemplateBadge>
          <TemplateBadge tone="neutral">Feature flag: entityTemplatesV2</TemplateBadge>
        </div>
        <h1 className="m-0 text-entityTitle text-text">Entity template registry &amp; primitives</h1>
        <p className="m-0 text-body text-grey-04">
          Shared UI primitives and view-model contracts backing Topic, Claim, Event, News story, Source, and Post
          templates. Toggle <code className="rounded-sm bg-grey-01 px-1.5 py-0.5 text-[13px]">entityTemplatesV2</code>{' '}
          in Feature flags (<kbd>Cmd/Ctrl+Shift+F</kbd>) to enable v2 template resolution.
        </p>
        {lastSelected && (
          <p className="m-0 rounded-md bg-ctaTertiary px-3 py-1.5 text-[13px] font-medium text-ctaPrimary">
            Last interaction: {lastSelected}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-smallTitle text-text">Registered template precedence</h2>
        <div className="divide-y divide-divider overflow-hidden rounded-xl border border-grey-02/70 bg-white">
          {ENTITY_TEMPLATE_REGISTRY.map((entry, idx) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="inline-grid h-5 w-5 place-items-center rounded-sm bg-grey-01 text-[11px] font-semibold text-grey-04">
                  {idx + 1}
                </span>
                <span className="font-semibold text-text">{entry.label}</span>
                <code className="text-[12px] text-grey-04">{entry.id}</code>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <TemplateBadge tone={entry.requiresV2Flag ? 'judgment' : 'agreed'}>
                  {entry.requiresV2Flag ? 'v2 flag' : 'live'}
                </TemplateBadge>
                {entry.keepInEditMode && <TemplateBadge tone="neutral">keep in edit</TemplateBadge>}
                {entry.requiresSpaceCheck && <TemplateBadge tone="neutral">space-scoped</TemplateBadge>}
                <TemplateBadge tone="neutral">{entry.typeIds.length} type ID(s)</TemplateBadge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-smallTitle text-text">VoteBox + SplitBars</h2>
        <VoteBox
          split={liveSplit}
          control={{
            userVote,
            countSummary: `${effectiveVotes.toLocaleString('en-US')} votes in all · 2,270 from members`,
            hint: 'Try clicking Agree or Disagree to verify controlled split updates.',
            impactNote: userVote ? `Recorded locally as ${userVote}.` : undefined,
            onVote: setUserVote,
            onClear: () => setUserVote(null),
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-smallTitle text-text">ClaimSummaryCard (lead contested + agreed)</h2>
        <div className="grid grid-cols-1 gap-3 @[680px]:grid-cols-2">
          <ClaimSummaryCard claim={leadClaim} variant="lead" className="@[680px]:col-span-2" />
          <ClaimSummaryCard claim={agreedClaim} variant="agreed" />
          <ClaimSummaryCard claim={{ ...leadClaim, id: 'demo-compact', overallPercent: undefined }} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-smallTitle text-text">SourceChipList</h2>
        <SourceChipList
          sources={[
            {
              id: 's1',
              index: 1,
              title: 'UNOSAT satellite damage assessment',
              onSelect: () => setLastSelected('Chip 1'),
            },
            { id: 's2', index: 2, title: 'IPC Famine Review', onSelect: () => setLastSelected('Chip 2') },
            { id: 's3', index: 3, title: 'ICJ provisional measures order', onSelect: () => setLastSelected('Chip 3') },
          ]}
        />
      </section>

      <RelatedListSection section={homogeneousSources} />
      <RelatedListSection section={mixedCitations} />
    </TemplateShell>
  );
}
