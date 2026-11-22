import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type GazaFixtureRoute, useGazaFixtureTemplates } from '../adapters/gaza-fixture';
import type { TopicTemplateModel } from '../models';
import { ContextPeekDrawer } from '../primitives';
import { ClaimTemplate } from './claim-template';
import { DebateTemplate } from './debate-template';
import { EventTemplate } from './event-template';
import { NewsStoryTemplate } from './news-story-template';
import { PodcastEpisodeTemplate } from './podcast-episode-template';
import { PodcastShowTemplate } from './podcast-show-template';
import { PostTemplate } from './post-template';
import { SourceLibraryTemplate } from './source-library-template';
import { SourceTemplate } from './source-template';
import { TimelineTemplate } from './timeline-template';
import { TopicTemplate } from './topic-template';

afterEach(cleanup);

function FixtureHarness({ initialRoute }: { initialRoute?: GazaFixtureRoute }) {
  const fixture = useGazaFixtureTemplates();
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (!initialized.current && initialRoute) {
      initialized.current = true;
      fixture.navigate(initialRoute);
    }
  }, [fixture, initialRoute]);

  let pageView: React.ReactNode = null;
  switch (fixture.activeRoute.kind) {
    case 'topic':
      pageView = fixture.topicSource.data ? <TopicTemplate model={fixture.topicSource.data} /> : null;
      break;
    case 'claim':
      pageView = fixture.claimSource.data ? <ClaimTemplate model={fixture.claimSource.data} /> : null;
      break;
    case 'event':
      pageView = fixture.eventSource.data ? <EventTemplate model={fixture.eventSource.data} /> : null;
      break;
    case 'news-story':
      pageView = fixture.storySource.data ? <NewsStoryTemplate model={fixture.storySource.data} /> : null;
      break;
    case 'source':
      pageView = fixture.sourceSource.data ? <SourceTemplate model={fixture.sourceSource.data} /> : null;
      break;
    case 'post':
      pageView = fixture.postSource.data ? <PostTemplate model={fixture.postSource.data} /> : null;
      break;
    case 'debate':
      pageView = fixture.debateSource.data ? <DebateTemplate model={fixture.debateSource.data} /> : null;
      break;
    case 'timeline':
      pageView = fixture.timelineSource.data ? <TimelineTemplate model={fixture.timelineSource.data} /> : null;
      break;
    case 'sources':
      pageView = fixture.sourceLibrarySource.data ? (
        <SourceLibraryTemplate model={fixture.sourceLibrarySource.data} />
      ) : null;
      break;
  }

  return (
    <>
      {pageView}
      <ContextPeekDrawer
        item={fixture.peekItem}
        canGoBack={fixture.canPeekGoBack}
        backLabel={fixture.peekBackLabel}
        onBack={fixture.popPeek}
        onClose={fixture.closePeek}
      />
    </>
  );
}

describe('TopicTemplate progressive disclosure', () => {
  it('omits unbacked Tier-2/3 modules on minimal live-style topic models', () => {
    const minimal: TopicTemplateModel = {
      id: 'topic-1',
      title: 'Renewable energy',
      lede: 'Grid-scale storage and generation.',
      stats: [{ label: 'Claims', value: '12' }],
      contestedClaims: [
        {
          id: 'c-1',
          title: 'Battery storage costs fell over 80% in the past decade',
          split: { rows: [], isSplit: true },
        },
      ],
    };

    render(<TopicTemplate model={minimal} />);

    expect(screen.getByRole('heading', { name: 'Renewable energy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Community view' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coverage and agreement over time' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Common ground' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'In each community’s own words' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Rankings' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'What’s spreading' })).toBeNull();
  });
});

describe('TopicTemplate ↔ ClaimTemplate ↔ Event ↔ Story ↔ Source ↔ Post graph', () => {
  it('navigates Topic -> Claim -> Event -> Story -> Source with inline voting and Claim Peek Drawer', () => {
    render(<FixtureHarness />);

    expect(screen.getByRole('heading', { name: 'Israel–Gaza war' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Community view' })).toBeNull();

    // Vote inline on a claim and open it via the Claim Peek Drawer
    const claimsSection = screen.getByRole('region', { name: 'Claims' });
    const genVoteGroup = within(claimsSection).getByRole('group', {
      name: /Vote on Israel is committing genocide in Gaza/i,
    });
    const inlineAgree = within(genVoteGroup).getByRole('button', { name: 'Agree' });
    fireEvent.click(inlineAgree);
    expect(inlineAgree).toHaveAttribute('aria-pressed', 'true');
    // Toggle off so downstream Vote Agree assertion starts clean
    fireEvent.click(inlineAgree);
    expect(inlineAgree).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(within(claimsSection).getByRole('button', { name: 'Israel is committing genocide in Gaza' }));
    const claimDrawer = screen.getByRole('dialog');
    expect(within(claimDrawer).getByText('Claim')).toBeInTheDocument();
    expect(within(claimDrawer).getAllByText('Judgment').length).toBeGreaterThan(0);
    expect(within(claimDrawer).getByRole('region', { name: 'Supporting claims' })).toBeInTheDocument();
    expect(within(claimDrawer).getByRole('region', { name: 'Opposing claims' })).toBeInTheDocument();
    expect(within(claimDrawer).getByRole('region', { name: 'Related claims' })).toBeInTheDocument();
    expect(within(claimDrawer).queryByText('Contested claim')).toBeNull();
    expect(within(claimDrawer).queryByText(/pts apart/i)).toBeNull();
    expect(within(claimDrawer).queryByText('The facts it turns on')).toBeNull();
    fireEvent.click(within(claimDrawer).getByRole('button', { name: /Open full claim page/i }));
    expect(screen.getByText('Claim')).toBeInTheDocument();
    expect(screen.getAllByText('Judgment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Factual').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Supporting claims' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Opposing claims' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Related claims' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Strongest cases' })).toBeNull();
    expect(screen.queryByText('Contested claim')).toBeNull();
    expect(screen.queryByText(/pts apart/i)).toBeNull();
    expect(screen.queryByText('The facts it turns on')).toBeNull();

    // Verify Context relation pills + ContextPeekDrawer on Claim page
    const contextSection = screen.getByRole('region', { name: 'Context' });
    fireEvent.click(within(contextSection).getByRole('button', { name: 'International Court of Justice' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: 'International Court of Justice' })).toBeInTheDocument();
    expect(within(drawer).getByRole('region', { name: 'Context' })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));

    // Vote Agree
    const voteSection = screen.getByRole('region', { name: 'Vote on this claim' });
    fireEvent.click(within(voteSection).getByRole('button', { name: 'Agree' }));
    expect(screen.getByText('You agreed.')).toBeInTheDocument();

    // Navigate from Claim -> Event -> News Story -> Source
    const eventsRegion = screen.getByRole('region', { name: 'Events' });
    fireEvent.click(
      within(eventsRegion).getByRole('button', { name: /^ICJ orders Israel to prevent genocidal acts/i })
    );
    expect(screen.getByRole('heading', { name: 'ICJ orders Israel to prevent genocidal acts' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^World court orders Israel to prevent genocidal acts/i }));
    expect(screen.getByText('News story')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read on NPR/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^ICJ order in South Africa v\. Israel/i }));
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('International Court of Justice')).toBeInTheDocument();
  });

  it('supports rating bridging notes and submitting a new context note on PostTemplate', () => {
    render(<FixtureHarness initialRoute={{ kind: 'post', id: 'p-camps' }} />);

    expect(screen.getByRole('heading', { name: 'Free Voices on X' })).toBeInTheDocument();
    expect(screen.getByText('Old footage')).toBeInTheDocument();

    const helpfulBtn = screen.getByRole('button', { name: 'Helpful' });
    fireEvent.click(helpfulBtn);
    expect(helpfulBtn).toHaveAttribute('aria-pressed', 'true');

    // Open composer and submit a new context note
    fireEvent.click(screen.getByRole('button', { name: 'Add context note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Missing context' }));
    fireEvent.change(screen.getByLabelText(/What do the sources show/i), {
      target: { value: 'Reverse image search confirms this footage was filmed in Aleppo in 2016.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit note' }));

    expect(screen.getByText('Your note · needs ratings')).toBeInTheDocument();
    expect(screen.getByText(/Reverse image search confirms this footage/i)).toBeInTheDocument();
  });

  it('renders accepted claim basis and peekable primary sources when inspecting an accepted claim', () => {
    render(<FixtureHarness />);

    const claimsSection = screen.getByRole('region', { name: 'Claims' });
    fireEvent.click(within(claimsSection).getByRole('tab', { name: /Accepted/i }));
    fireEvent.click(
      within(claimsSection).getByRole('button', { name: 'Most of Gaza’s buildings are damaged or destroyed' })
    );

    // Clicking the claim row opens the ContextPeekDrawer with accepted basis & primary sources
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Claim')).toBeInTheDocument();
    expect(within(drawer).getByText('Factual')).toBeInTheDocument();
    expect(within(drawer).queryByText('Agreed claim')).toBeNull();

    // Clicking a source chip inside the drawer drills into the source with a Back button
    fireEvent.click(within(drawer).getAllByRole('button', { name: /UNOSAT satellite damage assessment/i })[0]);
    expect(within(drawer).getByRole('heading', { name: 'UNOSAT satellite damage assessment' })).toBeInTheDocument();

    // Go back to claim in drawer, then open the full Claim page
    fireEvent.click(within(drawer).getByRole('button', { name: /Back/i }));
    fireEvent.click(within(drawer).getByRole('button', { name: /Open full claim page/i }));
    expect(screen.getByRole('heading', { name: 'Accepted' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disputed next' })).toBeInTheDocument();
  });

  it('renders 10 claims, Recent debates gallery, 8 timeline items, and Sources cleanly without removed sections', () => {
    render(<FixtureHarness />);

    expect(screen.queryByRole('region', { name: 'In each community’s own words' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Who’s who' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Rankings' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coverage and agreement over time' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'What’s spreading' })).toBeNull();
    expect(screen.queryByText(/members in communities/i)).toBeNull();
    expect(screen.queryByText(/pts apart/i)).toBeNull();

    const claims = screen.getByRole('region', { name: 'Claims' });
    const recentDebates = screen.getByRole('region', { name: 'Recent debates' });
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    const sources = screen.getByRole('region', { name: 'Sources & evidence' });

    expect(within(claims).getAllByRole('group', { name: /^Vote on /i })).toHaveLength(10);
    expect(within(claims).getByRole('button', { name: 'Add claim' })).toBeInTheDocument();
    expect(within(claims).getByRole('tab', { name: /Disputed/i })).toBeInTheDocument();
    expect(within(claims).getByRole('tab', { name: /Accepted/i })).toBeInTheDocument();
    expect(within(claims).getAllByText('World affairs').length).toBeGreaterThan(0);
    expect(within(claims).getByText('18.2k votes')).toBeInTheDocument();
    expect(within(claims).getByRole('button', { name: '11 debates' })).toBeInTheDocument();
    expect(within(recentDebates).getAllByRole('article')).toHaveLength(6);
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(8);
    expect(claims.compareDocumentPosition(recentDebates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recentDebates.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeline.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Timeline shows concise event summaries without duplicating claim vote bars
    expect(within(timeline).queryAllByRole('meter')).toHaveLength(0);
    expect(
      within(timeline).getByText(/An Israeli military official accepted the Gaza Health Ministry/i)
    ).toBeInTheDocument();

    // Sources render verbatim quotes, graph/flag count chips, and `...` Flag / Add context menus
    expect(within(sources).getByText(/The key component of genocide/i)).toBeInTheDocument();

    // Clicking the graph chip opens the Context drawer showing Context & Flags (no parenthetical counts)
    fireEvent.click(
      within(sources).getByRole('button', {
        name: /Show 5 context relations for Israel’s oral arguments at the ICJ/i,
      })
    );
    const viewerDrawer = screen.getByRole('dialog', {
      name: /Context for Israel’s oral arguments at the ICJ/i,
    });
    expect(within(viewerDrawer).getByRole('region', { name: 'Context' })).toBeInTheDocument();
    expect(within(viewerDrawer).getByRole('region', { name: 'Disputes' })).toBeInTheDocument();
    expect(within(viewerDrawer).queryByText(/Context \(\d+\)/)).toBeNull();
    expect(within(viewerDrawer).queryByText(/Disputes \(\d+\)/)).toBeNull();
    expect(within(viewerDrawer).getByText('Outcome')).toBeInTheDocument();
    expect(within(viewerDrawer).getByText('Court declined dismissal')).toBeInTheDocument();

    // Clicking inline `+` at the end of a relation pill row pops the Geo-style relation adder
    fireEvent.click(within(viewerDrawer).getByRole('button', { name: 'Add Outcome' }));
    const pillInput = screen.getByLabelText('Find or add Outcome');
    fireEvent.change(pillInput, { target: { value: 'Provisional measures ordered' } });
    fireEvent.click(screen.getByRole('button', { name: /Add “Provisional measures ordered”/i }));
    expect(within(viewerDrawer).getByText('Provisional measures ordered')).toBeInTheDocument();

    // Clicking the relation pill two-dot trigger opens the Genesis-style hover toolbar (Go to relation + Delete)
    fireEvent.click(
      within(viewerDrawer).getByRole('button', { name: 'Relation actions for Court declined dismissal' })
    );
    const goToRelationBtn = screen.getByRole('button', {
      name: /Go to relation: Outcome → Court declined dismissal/i,
    });
    expect(goToRelationBtn).toBeInTheDocument();

    // Clicking Go to relation opens the Relation entity pane (From -> To + Relation & Outcome type badges)
    fireEvent.click(goToRelationBtn);
    const relationPane = screen.getByRole('dialog', {
      name: /Relation: Israel’s oral arguments at the ICJ → Court declined dismissal/i,
    });
    expect(within(relationPane).getByText('Relation')).toBeInTheDocument();
    expect(within(relationPane).getAllByText('Outcome').length).toBeGreaterThan(0);
    fireEvent.click(within(relationPane).getByRole('button', { name: /Back to Israel’s oral arguments at the ICJ/i }));

    // Re-open relation pill actions and delete one relation
    const refreshedDrawer = screen.getByRole('dialog', {
      name: /Context for Israel’s oral arguments at the ICJ/i,
    });
    fireEvent.click(
      within(refreshedDrawer).getByRole('button', { name: 'Relation actions for Court declined dismissal' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete relation: Court declined dismissal' }));
    expect(within(refreshedDrawer).queryByText('Court declined dismissal')).toBeNull();
    fireEvent.click(within(refreshedDrawer).getByRole('button', { name: 'Close' }));

    // Verify Agree / Disagree buttons on a Dispute inside the Context drawer
    fireEvent.click(
      within(claims).getByRole('button', { name: /Show 1 dispute for Israel is committing genocide in Gaza/i })
    );
    const claimContextDrawer = screen.getByRole('dialog', {
      name: /Context for Israel is committing genocide in Gaza/i,
    });
    const flagVoteGroup = within(claimContextDrawer).getByRole('group', { name: 'Vote on dispute' });
    const flagAgree = within(flagVoteGroup).getByRole('button', { name: 'Agree' });
    fireEvent.click(flagAgree);
    expect(flagAgree).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(claimContextDrawer).getByRole('button', { name: 'Close' }));

    // Adding a new key-value triple via `...` -> Add context increments the graph chip count (5 -> 7)
    const sourceMenuTrigger = within(sources).getByRole('button', {
      name: /More actions for Israel’s oral arguments at the ICJ/i,
    });
    fireEvent.click(sourceMenuTrigger);
    expect(screen.getByRole('menuitem', { name: /Show context/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dispute' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Challenge' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add context' }));

    const contextDialog = screen.getByRole('dialog');
    fireEvent.change(within(contextDialog).getByLabelText(/Property \(relation key\)/i), {
      target: { value: 'Hearing day' },
    });
    fireEvent.change(within(contextDialog).getByLabelText(/Values \(comma-separated for multiple\)/i), {
      target: { value: 'Day 2, Peace Palace (The Hague)' },
    });
    fireEvent.click(within(contextDialog).getByRole('button', { name: 'Add context' }));
    expect(
      within(sources).getByRole('button', {
        name: /Show 7 context relations for Israel’s oral arguments at the ICJ/i,
      })
    ).toBeInTheDocument();

    // Topic header `...` menu toggles Show all context (key-value triples inline across the page)
    fireEvent.click(screen.getByRole('button', { name: /More actions for Israel–Gaza war/i }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Show all context/i }));
    expect(screen.getByRole('button', { name: /Showing context/i })).toBeInTheDocument();
    expect(within(claims).getByText('Supporting reports')).toBeInTheDocument();
    expect(within(claims).getByText('Amnesty International')).toBeInTheDocument();
  });

  it('navigates from Recent debates gallery to DebateTemplate and renders vote shifts', () => {
    render(<FixtureHarness />);

    const recentDebates = screen.getByRole('region', { name: 'Recent debates' });
    fireEvent.click(
      within(recentDebates).getAllByRole('button', { name: /Watch debate: Israel is committing genocide in Gaza/i })[0]
    );

    expect(screen.getByText('Debate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How the vote moved' })).toBeInTheDocument();
    expect(screen.getAllByText('+3 pts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Amira H.').length).toBeGreaterThan(0);
  });

  it('renders TimelineTemplate with era filtering, framing toggle, and Known/Disputed/Unknown', () => {
    render(<FixtureHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Full timeline/i }));
    expect(screen.getByRole('heading', { name: 'Israel–Gaza war: Timeline' })).toBeInTheDocument();
    expect(screen.getByText('Known')).toBeInTheDocument();
    expect(screen.getByText('Disputed')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();

    // Toggle community framings on
    fireEvent.click(screen.getByRole('button', { name: /Show how each community tells it/i }));
    expect(screen.getAllByText('Pro-Palestinian framing').length).toBeGreaterThan(0);

    // Filter to 1947–2004 era
    fireEvent.click(screen.getByRole('button', { name: /1947–2004/i }));
    expect(screen.getByText(/Six-Day War/i)).toBeInTheDocument();
  });

  it('renders SourceLibraryTemplate with live search and category filtering', () => {
    render(<FixtureHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Browse all 10 sources/i }));
    expect(screen.getByRole('heading', { name: 'Sources on the Israel–Gaza war' })).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search sources' });
    fireEvent.change(search, { target: { value: 'UNOSAT' } });
    expect(screen.getByText('UNOSAT satellite damage assessment')).toBeInTheDocument();
    expect(screen.queryByText('ICJ order in South Africa v. Israel')).toBeNull();
  });

  it('renders PodcastShowTemplate with episodes, hosts, listen links, filtering, and Context/Flags', () => {
    render(
      <PodcastShowTemplate
        model={{
          id: 'show-1',
          title: 'The Daily',
          description: 'Daily news reporting from journalists around the world.',
          episodeCount: 441,
          dateRange: '2017 – present',
          rssFeedUrl: 'https://feeds.simplecast.com/Sl5CSM3S',
          topics: [{ id: 't1', label: 'World affairs', href: '/space/s/t1' }],
          episodes: Array.from({ length: 8 }, (_, idx) => ({
            id: `ep-${idx + 1}`,
            title: idx === 0 ? 'Semiconductor Supply Chain Race' : `Episode ${idx + 1}`,
            airDate: 'Oct 1, 2025',
            durationLabel: '32 min',
            href: `/space/s/ep-${idx + 1}`,
          })),
          hosts: [{ id: 'h1', name: 'Michael Barbaro', role: 'Host', href: '/space/s/h1' }],
          listenOn: [
            { id: 'p1', name: 'Apple Podcasts', url: 'https://podcasts.apple.com/show/1' },
            { id: 'p2', name: 'Spotify', url: 'https://open.spotify.com/show/1' },
          ],
          graphConnections: [],
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'The Daily' })).toBeInTheDocument();
    expect(screen.getByText(/441 episodes · 2017 – present/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Apple Podcasts/i })).toHaveAttribute(
      'href',
      'https://podcasts.apple.com/show/1'
    );
    expect(screen.getByRole('link', { name: /Spotify/i })).toHaveAttribute('href', 'https://open.spotify.com/show/1');
    expect(screen.getByText('Michael Barbaro')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Context' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disputes' })).toBeInTheDocument();

    const filter = screen.getByRole('searchbox', { name: 'Filter episodes' });
    fireEvent.change(filter, { target: { value: 'Semiconductor' } });
    expect(screen.getByText('Semiconductor Supply Chain Race')).toBeInTheDocument();
    expect(screen.queryByText('Episode 2')).toBeNull();
  });

  it('renders PodcastEpisodeTemplate with show link, claims, quotes, people, audio player, and Context/Flags', () => {
    render(
      <PodcastEpisodeTemplate
        model={{
          id: 'ep-1',
          title: 'Pilots Killed in LaGuardia Crash',
          show: { id: 'show-wsj', name: 'WSJ What’s News', href: '/space/s/show-wsj' },
          airDate: 'Mar 22, 2026',
          durationLabel: '14 min',
          audioUrl: 'https://example.com/episode.mp3',
          description: 'A.M. Edition covering aviation safety and global trade.',
          topics: [{ id: 't1', label: 'Middle East', href: '/space/s/t1' }],
          claims: [
            {
              id: 'c1',
              title: 'Helium is a critical component in semiconductor manufacturing.',
              kind: 'fact',
              overallPercent: 92,
              split: {
                rows: [{ id: 'all', label: 'All spaces', color: '#202020', percent: 92, isEveryone: true }],
                isSplit: false,
                totalVotes: 12,
              },
              href: '/space/s/c1',
            },
          ],
          quotes: [
            { id: 'q1', text: 'Helium bottlenecks ripple immediately across wafer fabs.', speaker: 'Shelby Holliday' },
          ],
          hosts: [{ id: 'h1', name: 'Luke Vargas', role: 'Host', href: '/space/s/h1' }],
          guests: [{ id: 'g1', name: 'Shelby Holliday', role: 'Guest', href: '/space/s/g1' }],
          listenOn: [{ id: 'p1', name: 'Spotify', url: 'https://open.spotify.com/episode/1' }],
          graphConnections: [],
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Pilots Killed in LaGuardia Crash' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WSJ What’s News' })).toHaveAttribute('href', '/space/s/show-wsj');
    expect(screen.getByText('Helium is a critical component in semiconductor manufacturing.')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('12 votes')).toBeInTheDocument();
    expect(screen.getByText(/Helium bottlenecks ripple immediately across wafer fabs/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Luke Vargas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Shelby Holliday/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Context' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disputes' })).toBeInTheDocument();

    // Toggle inline audio player
    fireEvent.click(screen.getByRole('button', { name: /Play episode/i }));
    expect(screen.getByRole('button', { name: /Hide audio player/i })).toBeInTheDocument();
  });

  it('omits duplicate header and cover in embedded TopicTemplate mode for Topic Spaces', () => {
    const model: TopicTemplateModel = {
      id: 'topic-ai',
      title: 'AI',
      lede: 'Artificial intelligence space description',
      coverUrl: '/cover-ai.jpg',
      subtopics: [{ id: 'sub-1', label: 'AI Regulation', href: '/space/s/sub-1' }],
      contestedClaims: [
        {
          id: 'c-1',
          title: 'We should slow down AI development',
          kind: 'judgment',
          split: {
            rows: [{ id: 'ai', label: 'AI', color: '#202020', percent: 57, isEveryone: true }],
            isSplit: true,
            totalVotes: 28,
          },
        },
      ],
      agreedClaims: [],
    };

    render(<TopicTemplate model={model} embedded />);

    expect(screen.queryByRole('heading', { level: 1, name: 'AI' })).toBeNull();
    expect(screen.queryByText('Artificial intelligence space description')).toBeNull();
    expect(screen.getByRole('link', { name: 'AI Regulation' })).toBeInTheDocument();
    expect(screen.getByText('We should slow down AI development')).toBeInTheDocument();
  });

  it('orders ClaimTemplate with Supporting/Opposing vote rows high up, Debates gallery, Topic image pills, and Context/Disputes at the bottom', () => {
    const onSubClaimVote = vi.fn();
    render(
      <ClaimTemplate
        model={{
          id: 'claim-ai-slowdown',
          title: 'We should slow down AI development',
          kind: 'judgment',
          split: {
            rows: [{ id: 'all', label: 'All spaces', color: '#202020', percent: 57, isEveryone: true }],
            isSplit: true,
            totalVotes: 28,
          },
          voteBox: {
            userVote: null,
            countSummary: '28 votes',
            onVote: vi.fn(),
          },
          subClaims: [
            {
              id: 'sub-support-1',
              title: 'Safety evaluations lag behind frontier model capabilities.',
              kind: 'fact',
              stance: 'supports',
              agreeCount: 14,
              disagreeCount: 3,
              split: {
                rows: [{ id: 'all', label: 'All spaces', color: '#202020', percent: 82, isEveryone: true }],
                isSplit: false,
                totalVotes: 17,
              },
              sources: [],
              onVote: onSubClaimVote,
            },
            {
              id: 'sub-oppose-1',
              title: 'A slowdown would delay medical and scientific breakthroughs.',
              kind: 'judgment',
              stance: 'opposes',
              agreeCount: 9,
              disagreeCount: 6,
              split: {
                rows: [{ id: 'all', label: 'All spaces', color: '#202020', percent: 60, isEveryone: true }],
                isSplit: true,
                totalVotes: 15,
              },
              sources: [],
            },
          ],
          debates: [
            {
              id: 'deb-1',
              claimId: 'claim-ai-slowdown',
              claimTitle: 'We should slow down AI development',
              date: 'Sep 12, 2025',
              duration: '24 min',
              votesLabel: '28 votes',
              participants: [
                { name: 'Max Tegmark', position: 'Agree', communityColor: '#3963fe', avatarUrl: '/still-1.jpg' },
                { name: 'Yann LeCun', position: 'Disagree', communityColor: '#6833ff', avatarUrl: '/still-2.jpg' },
              ],
              href: '/space/s/deb-1',
            },
          ],
          topics: [
            {
              id: 'top-1',
              label: 'AI Safety',
              imageUrl: '/topic-ai-safety.png',
              href: '/space/s/top-1',
            },
          ],
          graphConnections: [
            {
              predicate: 'Space',
              items: [{ id: 'v1', label: 'AI', kind: 'topic' }],
            },
          ],
          sections: [
            {
              id: 'sources',
              title: 'Sources & evidence',
              items: [],
              emptyText: 'No sources',
            },
          ],
        }}
      />
    );

    const supporting = screen.getByRole('region', { name: 'Supporting claims' });
    const opposing = screen.getByRole('region', { name: 'Opposing claims' });
    const debates = screen.getByRole('region', { name: 'Debates' });
    const topics = screen.getByRole('region', { name: 'Topics' });
    const context = screen.getByRole('region', { name: 'Context' });
    const disputes = screen.getByRole('region', { name: 'Disputes' });

    expect(supporting.compareDocumentPosition(opposing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(opposing.compareDocumentPosition(debates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(debates.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(topics.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(context.compareDocumentPosition(disputes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Sub-claims render inline Agree/Disagree vote actions
    const subVoteGroup = within(supporting).getByRole('group', {
      name: /Vote on Safety evaluations lag behind frontier model capabilities\./i,
    });
    fireEvent.click(within(subVoteGroup).getByRole('button', { name: /^Agree/i }));
    expect(onSubClaimVote).toHaveBeenCalledWith('agree');

    // Topics render pills with circular images
    const topicLink = within(topics).getByRole('link', { name: 'AI Safety' });
    expect(topicLink).toHaveAttribute('href', '/space/s/top-1');
    expect(topicLink.querySelector('img')).toHaveAttribute('src', '/topic-ai-safety.png');

    // Sources & evidence empty state copy
    const sourcesSection = screen.getByRole('region', { name: 'Sources & evidence' });
    expect(within(sourcesSection).getByText('No sources')).toBeInTheDocument();

    // Disputes empty state copy
    expect(within(disputes).getByText('No disputes')).toBeInTheDocument();
  });
});
