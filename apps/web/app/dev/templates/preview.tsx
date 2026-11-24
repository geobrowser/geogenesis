'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  type ClaimSummaryModel,
  ENTITY_TEMPLATE_REGISTRY,
  type EntityListSectionModel,
  type GazaFixtureRoute,
  type PodcastEpisodeTemplateModel,
  type PodcastShowTemplateModel,
  type SplitBreakdown,
  type VoteChoice,
  computeSplitGap,
  isClaimSplit,
  useGazaFixtureTemplates,
} from '~/core/templates';
import {
  ClaimSummaryCard,
  ContextPeekDrawer,
  RelatedListSection,
  SourceChipList,
  TemplateBadge,
  TemplateShell,
  VoteBox,
} from '~/core/templates/primitives';
import {
  ClaimTemplate,
  DebateTemplate,
  EventTemplate,
  NewsStoryTemplate,
  PodcastEpisodeTemplate,
  PodcastShowTemplate,
  PostTemplate,
  SourceLibraryTemplate,
  SourceTemplate,
  TimelineTemplate,
  TopicTemplate,
} from '~/core/templates/views';

type PreviewMode = 'prototype' | 'podcast-show' | 'podcast-episode' | 'primitives';

const QUICK_JUMPS: readonly { label: string; route: GazaFixtureRoute }[] = [
  { label: 'Topic', route: { kind: 'topic' } },
  { label: 'Claim (disputed)', route: { kind: 'claim', id: 'gen' } },
  { label: 'Claim (accepted)', route: { kind: 'claim', id: 'build' } },
  { label: 'Debate', route: { kind: 'debate', id: 'd-gen' } },
  { label: 'Timeline', route: { kind: 'timeline' } },
  { label: 'Sources', route: { kind: 'sources' } },
  { label: 'Event', route: { kind: 'event', id: 'e71k' } },
  { label: 'News story', route: { kind: 'news-story', id: 'st-haaretz-71k' } },
  { label: 'Source', route: { kind: 'source', id: 's-icj' } },
  { label: 'Post', route: { kind: 'post', id: 'p-camps' } },
];

function routeMatches(a: GazaFixtureRoute, b: GazaFixtureRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'topic' || a.kind === 'timeline' || a.kind === 'sources') return true;
  if (b.kind === 'topic' || b.kind === 'timeline' || b.kind === 'sources') return false;
  return a.id === b.id;
}

/**
 * Interactive sandbox covering all six entity templates (`Topic`, `Claim`, `Event`, `NewsStory`,
 * `Source`, `Post`) backed by the cross-linked Gaza fixture adapter, plus the Registry & primitives view.
 */
export function DevTemplatesPreview() {
  const [mode, setMode] = React.useState<PreviewMode>('prototype');
  const fixture = useGazaFixtureTemplates();

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-divider bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_JUMPS.map(jump => {
              const active = mode === 'prototype' && routeMatches(fixture.activeRoute, jump.route);
              return (
                <button
                  key={jump.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMode('prototype');
                    fixture.navigate(jump.route);
                  }}
                  className={cx(
                    'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
                    active ? 'border-text bg-text text-white' : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  {jump.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={mode === 'podcast-show'}
              onClick={() => setMode('podcast-show')}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
                mode === 'podcast-show'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              Podcast show
            </button>
            <button
              type="button"
              aria-pressed={mode === 'podcast-episode'}
              onClick={() => setMode('podcast-episode')}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
                mode === 'podcast-episode'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              Podcast episode
            </button>
            <button
              type="button"
              aria-pressed={mode === 'primitives'}
              onClick={() => setMode('primitives')}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
                mode === 'primitives'
                  ? 'border-ctaPrimary bg-ctaPrimary text-white'
                  : 'border-grey-02 bg-grey-01 text-grey-05 hover:border-text'
              )}
            >
              Registry &amp; primitives
            </button>
          </div>

          <span className="text-[14px] text-grey-04">
            Flag: <code className="rounded-sm bg-grey-01 px-1.5 py-0.5 text-[13px] text-text">entityTemplatesV2</code>
          </span>
        </div>
      </div>

      {mode === 'primitives' ? (
        <PrimitivesGallery />
      ) : mode === 'podcast-show' ? (
        <PodcastShowTemplate model={DEMO_PODCAST_SHOW(() => setMode('podcast-episode'))} />
      ) : mode === 'podcast-episode' ? (
        <PodcastEpisodeTemplate model={DEMO_PODCAST_EPISODE(() => setMode('podcast-show'))} />
      ) : fixture.activeRoute.kind === 'topic' && fixture.topicSource.data ? (
        <TopicTemplate model={fixture.topicSource.data} />
      ) : fixture.activeRoute.kind === 'claim' && fixture.claimSource.data ? (
        <ClaimTemplate model={fixture.claimSource.data} />
      ) : fixture.activeRoute.kind === 'event' && fixture.eventSource.data ? (
        <EventTemplate model={fixture.eventSource.data} />
      ) : fixture.activeRoute.kind === 'news-story' && fixture.storySource.data ? (
        <NewsStoryTemplate model={fixture.storySource.data} />
      ) : fixture.activeRoute.kind === 'source' && fixture.sourceSource.data ? (
        <SourceTemplate model={fixture.sourceSource.data} />
      ) : fixture.activeRoute.kind === 'post' && fixture.postSource.data ? (
        <PostTemplate model={fixture.postSource.data} />
      ) : fixture.activeRoute.kind === 'debate' && fixture.debateSource.data ? (
        <DebateTemplate model={fixture.debateSource.data} />
      ) : fixture.activeRoute.kind === 'timeline' && fixture.timelineSource.data ? (
        <TimelineTemplate model={fixture.timelineSource.data} />
      ) : fixture.activeRoute.kind === 'sources' && fixture.sourceLibrarySource.data ? (
        <SourceLibraryTemplate model={fixture.sourceLibrarySource.data} />
      ) : null}

      <ContextPeekDrawer
        item={fixture.peekItem}
        canGoBack={fixture.canPeekGoBack}
        backLabel={fixture.peekBackLabel}
        onBack={fixture.popPeek}
        onClose={fixture.closePeek}
      />
    </div>
  );
}

function PrimitivesGallery() {
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
      { id: 'c1', label: 'Community A', color: '#6833ff', percent: 94, voterCount: 1180 },
      { id: 'c2', label: 'Community B', color: '#3963fe', percent: 6, voterCount: 1090 },
      {
        id: 'all',
        label: 'Everyone',
        color: '#202020',
        percent: effectiveAll,
        voterCount: effectiveVotes,
        isEveryone: true,
      },
    ];
    const gapPoints = computeSplitGap(rows);
    return { rows, gapPoints, isSplit: isClaimSplit(gapPoints), totalVotes: effectiveVotes };
  }, [effectiveAll, effectiveVotes]);

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
        { id: 'c1', label: 'Community A', color: '#6833ff', percent: 96 },
        { id: 'c2', label: 'Community B', color: '#3963fe', percent: 90 },
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
        { id: 'templates', label: 'Registry & primitives' },
      ]}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TemplateBadge tone="dark">Template registry</TemplateBadge>
          <TemplateBadge tone="neutral">Feature flag: entityTemplatesV2</TemplateBadge>
        </div>
        <h1 className="m-0 text-entityTitle text-text">Entity template registry &amp; primitives</h1>
        <p className="m-0 text-body text-grey-04">
          Toggle <code className="rounded-sm bg-grey-01 px-1.5 py-0.5 text-[13px]">entityTemplatesV2</code> in Feature
          flags (<kbd>Cmd/Ctrl+Shift+F</kbd>) to render live Topic, Claim, Event, News story, Source, and Post entities
          with these templates.
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

function DEMO_PODCAST_SHOW(onOpenEpisode: () => void): PodcastShowTemplateModel {
  return {
    id: 'demo-show-the-daily',
    title: 'The Daily',
    breadcrumbs: [
      { id: 'podcasts', label: 'Podcasts' },
      { id: 'demo-show-the-daily', label: 'The Daily' },
    ],
    description:
      'This is what the news should sound like. The biggest stories of our time, told by the best journalists in the world. Hosted by Michael Barbaro, Rachel Abrams and Natalie Kitroeff. Twenty minutes a day, five days a week.',
    episodeCount: 441,
    dateRange: '2017 – present',
    rssFeedUrl: 'https://feeds.simplecast.com/Sl5CSM3S',
    topics: [
      { id: 't-news', label: 'World affairs' },
      { id: 't-pol', label: 'US Politics' },
      { id: 't-econ', label: 'Global trade' },
    ],
    episodes: [
      {
        id: 'demo-ep-1',
        title: 'The Democrats’ Big Shutdown Gamble',
        showName: 'The Daily',
        description:
          'Congressional correspondents Catie Edmondson and Carl Hulse walk through how the shutdown unfolded, followed by an interview with Senator Chuck Schumer.',
        airDate: 'Oct 1, 2025',
        durationLabel: '38 min',
        onSelect: onOpenEpisode,
      },
      {
        id: 'demo-ep-2',
        title: 'Inside the Semiconductor Supply Chain Race',
        showName: 'The Daily',
        description:
          'Why building cutting-edge chip fabrication plants takes years and tens of billions of dollars — and what export curbs mean for AI competition.',
        airDate: 'Sep 28, 2025',
        durationLabel: '26 min',
        onSelect: onOpenEpisode,
      },
    ],
    hosts: [
      { id: 'h-1', name: 'Michael Barbaro', role: 'Host' },
      { id: 'h-2', name: 'Sabrina Tavernise', role: 'Host' },
      { id: 'h-3', name: 'Natalie Kitroeff', role: 'Host' },
    ],
    listenOn: [
      { id: 'l-apple', name: 'Apple Podcasts', url: 'https://podcasts.apple.com' },
      { id: 'l-spotify', name: 'Spotify', url: 'https://open.spotify.com/show/3IM0lmZxpFAY7CwMuv9H4g' },
    ],
    graphConnections: [
      { predicate: 'Publisher', items: [{ id: 'p-nyt', label: 'The New York Times', kind: 'entity' }] },
    ],
  };
}

function DEMO_PODCAST_EPISODE(onOpenShow: () => void): PodcastEpisodeTemplateModel {
  return {
    id: 'demo-ep-1',
    title: 'The Democrats’ Big Shutdown Gamble',
    breadcrumbs: [
      { id: 'podcasts', label: 'Podcasts' },
      { id: 'demo-show-the-daily', label: 'The Daily', onSelect: onOpenShow },
      { id: 'demo-ep-1', label: 'The Democrats’ Big Shutdown Gamble' },
    ],
    show: {
      id: 'demo-show-the-daily',
      name: 'The Daily',
      onSelect: onOpenShow,
    },
    airDate: 'Oct 1, 2025',
    durationLabel: '38 min',
    episodeNumber: 1842,
    audioUrl: 'https://pdst.fm/e/traffic.megaphone.fm/WSJ4216833950.mp3',
    description:
      'The U.S. government shut down on Wednesday morning. In an episode recorded from the Capitol, Catie Edmondson and Carl Hulse explain how leadership made the call, followed by an interview with Senator Chuck Schumer.',
    topics: [
      { id: 't-pol', label: 'US Politics' },
      { id: 't-cong', label: 'Congress' },
    ],
    claims: [
      {
        id: 'ep-c1',
        title: 'A prolonged funding impasse leads federal agencies to furlough non-essential personnel.',
        kind: 'fact',
        overallPercent: 86,
        split: {
          rows: [{ id: 'all', label: 'All spaces', color: '#202020', percent: 86, isEveryone: true }],
          isSplit: false,
          totalVotes: 24,
        },
      },
      {
        id: 'ep-c2',
        title: 'Forcing a shutdown gives the minority party meaningful leverage in budget negotiations.',
        kind: 'judgment',
        overallPercent: 48,
        split: {
          rows: [{ id: 'all', label: 'All spaces', color: '#202020', percent: 48, isEveryone: true }],
          isSplit: true,
          totalVotes: 41,
        },
      },
    ],
    quotes: [
      {
        id: 'ep-q1',
        text: 'Nobody wins a shutdown cleanly — the real contest is over which side voters blame by week two.',
        speaker: 'Carl Hulse',
      },
    ],
    hosts: [{ id: 'h-1', name: 'Michael Barbaro', role: 'Host' }],
    guests: [
      { id: 'g-1', name: 'Catie Edmondson', role: 'Guest' },
      { id: 'g-2', name: 'Carl Hulse', role: 'Guest' },
    ],
    listenOn: [
      { id: 'l-apple', name: 'Apple Podcasts', url: 'https://podcasts.apple.com' },
      { id: 'l-spotify', name: 'Spotify', url: 'https://open.spotify.com' },
    ],
    graphConnections: [{ predicate: 'Sources', items: [{ id: 'src-rss', label: 'RSS Feed', kind: 'source' }] }],
  };
}
