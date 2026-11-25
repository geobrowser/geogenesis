import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GazaFixtureRoute, useGazaFixtureTemplates } from '../adapters/gaza-fixture';
import type { TopicTemplateModel } from '../models';
import { ContextPeekDrawer } from '../primitives';
import { TEMPLATE_ACTIONS } from '../template-actions';
import { ClaimTemplate } from './claim-template';
import { DebateTemplate } from './debate-template';
import { EventTemplate } from './event-template';
import { NewsStoryTemplate } from './news-story-template';
import { PodcastEpisodeTemplate } from './podcast-episode-template';
import { PodcastExpandableDescription } from './podcast-shared';
import { PodcastShowTemplate } from './podcast-show-template';
import { PostTemplate } from './post-template';
import { SourceLibraryTemplate } from './source-library-template';
import { SourceTemplate } from './source-template';
import { TimelineTemplate } from './timeline-template';
import { TopicTemplate } from './topic-template';

afterEach(cleanup);

// The shipped switch, read before any test flips it, and put back after each one that does.
const SHIPPED_TEMPLATE_ACTIONS = { ...TEMPLATE_ACTIONS };
function restoreTemplateActions() {
  Object.assign(TEMPLATE_ACTIONS, SHIPPED_TEMPLATE_ACTIONS);
}

/** These fixture walks cover Add context and Dispute with the actions switched on. */
function withTemplateActionsOn() {
  beforeEach(() => {
    TEMPLATE_ACTIONS.addContext = true;
    TEMPLATE_ACTIONS.dispute = true;
  });
  afterEach(restoreTemplateActions);
}

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
  withTemplateActionsOn();

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
    const contextSection = screen.getByRole('region', { name: 'Properties' });
    fireEvent.click(within(contextSection).getByRole('button', { name: 'International Court of Justice' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: 'International Court of Justice' })).toBeInTheDocument();
    expect(within(drawer).getByRole('region', { name: 'Properties' })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));

    // Vote Agree
    const voteSection = screen.getByRole('region', { name: 'Vote on this claim' });
    fireEvent.click(within(voteSection).getByRole('button', { name: 'Agree' }));
    expect(within(voteSection).getByRole('button', { name: 'Agree' })).toHaveAttribute('aria-pressed', 'true');

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

    // Accepted claims follow the disputed ones in the one list (GEO-3854), past the first page here.
    const claimsSection = screen.getByRole('region', { name: 'Claims' });
    fireEvent.click(within(claimsSection).getByRole('button', { name: 'Next page' }));
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
    const sources = screen.getByRole('region', { name: 'Sources' });

    expect(within(claims).getAllByRole('group', { name: /^Vote on /i })).toHaveLength(10);
    expect(within(claims).getByRole('button', { name: 'Add claim' })).toBeInTheDocument();
    // One list, no Disputed / Accepted toggle (GEO-3854).
    expect(within(claims).queryByRole('tab')).toBeNull();
    expect(within(claims).getAllByText('World affairs').length).toBeGreaterThan(0);
    expect(within(claims).getByText('18.2k votes')).toBeInTheDocument();
    // No debate counts in claim lists (GEO-3845).
    expect(within(claims).queryByRole('button', { name: '11 debates' })).toBeNull();
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
    expect(within(viewerDrawer).getByRole('region', { name: 'Properties' })).toBeInTheDocument();
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
    // The debates app's button (GEO-3845): ink outline on the held side, not the old black-filled pill.
    expect(flagAgree).toHaveClass('border-[#151515]');
    expect(flagAgree).not.toHaveClass('bg-text');
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
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
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
    expect(screen.getAllByText('92%').length).toBeGreaterThan(0);
    expect(screen.getByText('12 votes')).toBeInTheDocument();
    expect(screen.getByText(/Helium bottlenecks ripple immediately across wafer fabs/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Luke Vargas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Shelby Holliday/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
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
              title: 'Sources',
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
    const context = screen.getByRole('region', { name: 'Properties' });
    const disputes = screen.getByRole('region', { name: 'Disputes' });

    expect(supporting.compareDocumentPosition(opposing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(opposing.compareDocumentPosition(debates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(debates.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(topics.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(context.compareDocumentPosition(disputes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The Claim page's Debates row uses the video-only card: claim over the video, no footer below it.
    const debateCard = within(debates).getByRole('link', { name: 'Watch debate: We should slow down AI development' });
    expect(debateCard.querySelector('[data-debate-claim-overlay]')).toHaveTextContent(
      'We should slow down AI development'
    );
    expect(debateCard.querySelector('[data-speaker-chip="top"]')).toHaveClass('bottom-7');
    expect(within(debates).getAllByRole('article')[0].children).toHaveLength(1);
    expect(within(debates).queryByText(/28 votes/)).toBeNull();

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

    // Sources empty state copy
    const sourcesSection = screen.getByRole('region', { name: 'Sources' });
    expect(within(sourcesSection).getByText('No sources')).toBeInTheDocument();

    // Disputes empty state copy
    expect(within(disputes).getByText('No disputes')).toBeInTheDocument();
  });

  it('renders NewsStoryTemplate with masonry Sources, Topic image pills, and Context/Disputes at the bottom', () => {
    render(
      <NewsStoryTemplate
        model={{
          id: 'story-1',
          headline: 'Anthropic IPO fails to revive AI trade',
          date: 'Nov 20, 2026',
          summary: 'US tech stocks slid despite Anthropic debut.',
          topics: [
            { id: 't-ai', label: 'AI', imageUrl: '/topic-ai.png', href: '/space/s/t-ai' },
            { id: 't-mkt', label: 'Markets', href: '/space/s/t-mkt' },
          ],
          relatedPeople: [{ id: 'p-1', label: 'Dario Amodei', href: '/space/s/p-1' }],
          relatedProjects: [{ id: 'pr-1', label: 'Anthropic', href: '/space/s/pr-1' }],
          relatedEntities: [{ id: 'e-1', label: 'Nasdaq', href: '/space/s/e-1' }],
          sources: [
            {
              id: 'src-1',
              title: 'Tech Stocks Tumble Despite Landmark AI IPO',
              publication: 'Reuters',
              date: 'Nov 20, 2026',
              url: 'https://reuters.com/example',
              href: '/space/s/src-1',
            },
            {
              id: 'src-2',
              title: 'Semiconductor Shares Pull Back in Late Trading',
              publication: 'Financial Times',
              date: 'Nov 20, 2026',
              url: 'https://ft.com/example',
              href: '/space/s/src-2',
            },
          ],
          reportedClaims: [],
          sections: [],
        }}
      />
    );

    const sources = screen.getByRole('region', { name: 'Sources' });
    const rail = screen.getByRole('complementary', { name: 'Story connections' });
    const topics = within(rail).getByRole('region', { name: 'Topics' });
    const context = screen.getByRole('region', { name: 'Properties' });
    const disputes = screen.getByRole('region', { name: 'Disputes' });

    expect(sources.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(context.compareDocumentPosition(disputes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Right rail surfaces People involved, Related projects, Related entities, and Topics
    expect(within(rail).getByRole('link', { name: 'Dario Amodei' })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: 'Anthropic' })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: 'Nasdaq' })).toBeInTheDocument();

    // Masonry source cards render publisher & headline
    expect(within(sources).getByText('Tech Stocks Tumble Despite Landmark AI IPO')).toBeInTheDocument();
    expect(within(sources).getByText('Semiconductor Shares Pull Back in Late Trading')).toBeInTheDocument();

    // Topic image pills render thumbnail images
    const aiPill = within(topics).getByRole('link', { name: 'AI' });
    expect(aiPill.querySelector('img')).toHaveAttribute('src', '/topic-ai.png');

    // Quiet empty states rendered cleanly
    expect(within(context).getByText('No properties added yet.')).toBeInTheDocument();
    expect(within(disputes).getByText('No disputes')).toBeInTheDocument();
  });
});

describe('GEO-3819 layout fixes', () => {
  it('shows every loaded episode with only "Load more episodes", no page numbers', () => {
    const onLoadMoreEpisodes = vi.fn();
    render(
      <PodcastShowTemplate
        model={{
          id: 'show-paging',
          title: 'Long Show',
          episodeCount: 25,
          topics: [],
          episodes: Array.from({ length: 25 }, (_, idx) => ({
            id: `ep-${idx + 1}`,
            title: `Paged episode ${idx + 1}`,
            href: `/space/s/ep-${idx + 1}`,
          })),
          hosts: [],
          listenOn: [],
          hasMoreEpisodes: true,
          onLoadMoreEpisodes,
          graphConnections: [],
        }}
      />
    );

    expect(screen.getByText('Paged episode 1')).toBeInTheDocument();
    expect(screen.getByText('Paged episode 25')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /pages|pagination/i })).toBeNull();
    expect(screen.queryByText(/^\d+\s*\/\s*\d+$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load more episodes' }));
    expect(onLoadMoreEpisodes).toHaveBeenCalledTimes(1);
  });

  it('collapses a long episode description and links its URLs', () => {
    // jsdom has no layout, so give the body a scroll height taller than its collapsed box.
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(125);
    try {
      render(
        <PodcastExpandableDescription
          description={
            'Today we talk about stablecoins.\nSponsored by Acme. Go to https://acme.example/pod. Or www.example.org/deal'
          }
        />
      );

      const body = screen.getByTestId('podcast-description-body');
      expect(body).toHaveStyle({ maxHeight: '125px' });

      const link = screen.getByRole('link', { name: 'https://acme.example/pod' });
      expect(link).toHaveAttribute('href', 'https://acme.example/pod');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByRole('link', { name: 'www.example.org/deal' })).toHaveAttribute(
        'href',
        'https://www.example.org/deal'
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      expect(body.style.maxHeight).toBe('');
      expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    } finally {
      scrollHeight.mockRestore();
      clientHeight.mockRestore();
    }
  });

  it('draws the post author card with avatar and handle, and without them when the graph has none', () => {
    const baseModel = {
      id: 'post-1',
      authorName: 'Shashank Joshi',
      platform: 'X',
      body: 'Striking to see the degree to which Israel has become a major dividing line within both parties.',
      claims: [],
      notes: [],
      sections: [],
    };
    const { container, rerender } = render(
      <PostTemplate model={{ ...baseModel, authorHandle: '@shashj', authorAvatarUrl: 'https://example.com/a.png' }} />
    );

    expect(screen.getByText('@shashj')).toBeInTheDocument();
    expect(container.querySelector('article img[src="https://example.com/a.png"]')).not.toBeNull();
    expect(screen.getByText(baseModel.body)).toBeInTheDocument();

    rerender(<PostTemplate model={baseModel} />);
    expect(screen.queryByText('@shashj')).toBeNull();
    expect(container.querySelector('article img')).toBeNull();
  });
});

describe('EventTemplate Sources section (GEO-3819)', () => {
  it('shows "No sources" with an add button when the event has none', () => {
    render(
      <EventTemplate
        model={{
          id: 'event-1',
          title: 'An event with no sources yet',
          when: 'Nov 23, 2026',
          claims: [],
          sections: [{ id: 'sources', title: 'Sources', layout: 'cards', emptyText: 'No sources', items: [] }],
        }}
      />
    );

    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByText('No sources')).toBeInTheDocument();
    expect(within(sources).getByRole('button', { name: /add source/i })).toBeInTheDocument();
  });
});

describe('PostTemplate Sources section (GEO-3819)', () => {
  it('shows "No sources" with an add button when the post has none', () => {
    render(
      <PostTemplate
        model={{
          id: 'post-no-sources',
          authorName: 'Someone',
          platform: 'X',
          body: 'A post with no sources yet.',
          claims: [],
          notes: [],
          sections: [{ id: 'sources', title: 'Sources', layout: 'cards', emptyText: 'No sources', items: [] }],
        }}
      />
    );

    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByText('No sources')).toBeInTheDocument();
    expect(within(sources).getByRole('button', { name: /add source/i })).toBeInTheDocument();
  });
});

describe('Add context and Dispute switched off (GEO-3819 defaults)', () => {
  const story = {
    id: 'story-off',
    headline: 'Story with no context yet',
    date: 'Nov 20, 2026',
    summary: 'Summary.',
    topics: [],
    relatedPeople: [],
    relatedProjects: [],
    relatedEntities: [],
    sources: [
      {
        id: 'src-off',
        title: 'A linked source',
        publication: 'Reuters',
        date: 'Nov 20, 2026',
        url: 'https://reuters.com/example',
        href: '/space/s/src-off',
      },
    ],
    reportedClaims: [],
    sections: [],
  };

  it('ships both actions off in the one switch', () => {
    expect(SHIPPED_TEMPLATE_ACTIONS).toEqual({ addContext: false, dispute: false });
  });

  it('shows no Add context / Dispute entry point and no empty Context or Disputes section', () => {
    render(<NewsStoryTemplate model={story} />);

    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Disputes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /add context|add dispute|dispute|challenge/i })).toBeNull();
    expect(screen.queryByText(/^(Add context|Dispute|Challenge)$/)).toBeNull();
    // The Sources `+` stays: it is the link ingestion, not an Add context action.
    expect(
      within(screen.getByRole('region', { name: 'Sources' })).getByRole('button', { name: 'Add source' })
    ).toBeInTheDocument();
  });

  it('hides the Post "Add context note" button and the empty Context notes section', () => {
    const fixture = { current: null as ReturnType<typeof useGazaFixtureTemplates> | null };
    function Probe() {
      fixture.current = useGazaFixtureTemplates();
      return null;
    }
    render(<Probe />);
    const post = fixture.current?.postSource.data;
    expect(post).toBeTruthy();
    cleanup();

    render(<PostTemplate model={{ ...post!, notes: [] }} />);
    expect(screen.queryByRole('button', { name: 'Add context note' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Context notes' })).toBeNull();
  });

  it('brings every entry point back when the switch is flipped on', () => {
    TEMPLATE_ACTIONS.addContext = true;
    TEMPLATE_ACTIONS.dispute = true;
    try {
      render(<NewsStoryTemplate model={story} />);
      expect(screen.getByRole('region', { name: 'Properties' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Disputes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add context' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add dispute' })).toBeInTheDocument();
    } finally {
      restoreTemplateActions();
    }
  });
});

describe('Topic Context & Disputes row with nothing in it (GEO-3819)', () => {
  it('hides the wrapper instead of leaving an empty row and its gap on a live Topic', () => {
    const { container } = render(
      <TopicTemplate model={{ id: 'topic-empty', title: 'Quiet topic', lede: '' }} actionCallbacks={{}} />
    );
    // Live (callbacks set), but no context and no disputes: both sections hide themselves.
    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Disputes' })).toBeNull();
    // jsdom applies no Tailwind; the wrapper must be empty and carry the class that hides it.
    const wrapper = container.querySelector('[class~="empty:hidden"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toBeEmptyDOMElement();
  });
});

describe('News story Add claim with claim groups (GEO-3836)', () => {
  const CLAIM_ID = 'cccccccccccccccccccccccccccccccc';
  const GROUPED_ID = 'dddddddddddddddddddddddddddddddd';
  const claim = (id: string, title: string) => ({ id, title, split: { rows: [], isSplit: false } });
  const base = {
    id: 'story-groups',
    headline: 'Story with groups',
    date: 'Nov 20, 2026',
    summary: 'Summary.',
    topics: [],
    relatedPeople: [],
    relatedProjects: [],
    relatedEntities: [],
    sources: [],
    sections: [],
    claimGroups: [{ id: 'g-1', title: 'What was said', claims: [claim(GROUPED_ID, 'Talks resumed')] }],
  };

  it('adds to Other claims, and the claim is still there after a reload', async () => {
    let settle!: (result: { ok: true; id: string; spaceId: string }) => void;
    const onAddClaim = vi.fn(() => new Promise<never>(resolve => (settle = resolve as never)));
    const view = (reportedClaims: ReturnType<typeof claim>[], key = 'a') => (
      <NewsStoryTemplate
        key={key}
        model={{ ...base, reportedClaims }}
        actionCallbacks={{ onAddClaim, canOpenAddForm: () => true }}
      />
    );
    const { rerender } = render(view([]));

    // One Add claim: a claim is linked flat, so it can't be added into a group.
    expect(screen.queryByRole('button', { name: /Add claim to/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    const input = screen.getByPlaceholderText(/Write a clear, testable statement/);
    fireEvent.change(input, { target: { value: 'Aid entered on Monday' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByText('Publishing…')).toBeInTheDocument();
    await React.act(async () => settle({ ok: true, id: CLAIM_ID, spaceId: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }));

    // A reload: a fresh mount whose model carries the claim as a flat (Related claims) link.
    rerender(view([claim(CLAIM_ID, 'Aid entered on Monday'), claim(GROUPED_ID, 'Talks resumed')], 'b'));
    const other = screen.getByRole('region', { name: 'Other claims' });
    expect(within(other).getByText('Aid entered on Monday')).toBeInTheDocument();
    // A flat claim a group already holds is drawn once, in its group.
    expect(screen.getAllByText('Talks resumed')).toHaveLength(1);
    expect(screen.queryByText('Publishing…')).toBeNull();
  });

  it('draws no Other claims section without flat claims or a way to add one', () => {
    render(<NewsStoryTemplate model={{ ...base, reportedClaims: [] }} />);
    expect(screen.queryByRole('region', { name: 'Other claims' })).toBeNull();
  });
});

describe('GEO-3837 phone tidy-ups', () => {
  const split = (totalVotes: number) => ({
    rows: [
      { id: 'wa', label: 'World affairs', color: '#202020', percent: 60, voterCount: totalVotes, isEveryone: true },
    ],
    isSplit: true,
    totalVotes,
  });

  it('puts the subtopics behind "Show subtopics" at every width', () => {
    render(
      <TopicTemplate
        model={{
          id: 'topic-gaza',
          title: 'Gaza',
          lede: 'The war in Gaza',
          subtopics: [{ id: 'sub-1', label: 'Ceasefire', href: '/space/s/sub-1' }],
        }}
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Subtopics', hidden: true });
    const toggle = screen.getByRole('button', { name: 'Show subtopics' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', nav.id);
    expect(toggle).not.toHaveClass('@[760px]:hidden');
    // jsdom applies no Tailwind: collapsed, the nav is hidden with no desktop override.
    expect(nav).toHaveClass('hidden');
    expect(nav).not.toHaveClass('@[760px]:flex');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide subtopics' })).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveClass('flex');
    expect(nav).not.toHaveClass('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Hide subtopics' }));
    expect(screen.getByRole('button', { name: 'Show subtopics' })).toBeInTheDocument();
  });

  it('draws no subtopics button when there are no subtopics', () => {
    render(<TopicTemplate model={{ id: 'topic-quiet', title: 'Quiet', lede: 'Nothing under it' }} />);

    expect(screen.queryByRole('button', { name: 'Show subtopics' })).toBeNull();
  });

  it('keeps the timeline arrow to desktop, and puts the desktop circle in the phone margin', () => {
    render(
      <TopicTemplate
        model={{
          id: 'topic-gaza',
          title: 'Gaza',
          lede: '',
          timelineHighlights: [{ id: 'ev-1', when: 'Oct 2023', title: 'Attack on Israel', href: '/space/s/ev-1' }],
        }}
      />
    );

    const link = screen.getByRole('link', { name: /Attack on Israel/ });
    expect(link.querySelector('svg')).toHaveClass('hidden', '@[680px]:block');
    // Phones: the spine column (18px + 12px gap) is pulled into the page margin, so the date and the
    // event line up with the section headers (GEO-3854).
    const row = link.closest('li')!;
    expect(row).toHaveClass(
      '-ml-[30px]',
      'grid-cols-[18px_minmax(0,1fr)]',
      'gap-x-3',
      '@[680px]:ml-0',
      '@[680px]:grid-cols-[118px_28px_minmax(0,1fr)]'
    );
    const spine = row.querySelector('[class*="row-span-2"]')!;
    expect(spine).toHaveClass('col-start-1', 'flex');
    expect(spine).not.toHaveClass('hidden');
    // The desktop circle on every width: 18px, grey-02 outline, 8px ink center.
    const circle = spine.querySelector('.z-10')!;
    expect(circle).toHaveClass('size-[18px]', 'border', 'border-grey-02', 'bg-white');
    expect(circle).not.toHaveClass('size-3', 'border-transparent');
    expect(circle.firstElementChild).toHaveClass('size-2', 'rounded-full', 'bg-text');
    expect(screen.getByText('Oct 2023')).toHaveClass('col-start-2', 'row-start-1');
  });

  it.each([
    ['the side panel', { compact: true }],
    ['the Space home', { embedded: true }],
  ])('keeps the phone timeline spine inside the column in %s, where the margin is too narrow', (_, props) => {
    render(
      <TopicTemplate
        {...props}
        model={{
          id: 'topic-gaza',
          title: 'Gaza',
          lede: '',
          timelineHighlights: [{ id: 'ev-1', when: 'Oct 2023', title: 'Attack on Israel', href: '/space/s/ev-1' }],
        }}
      />
    );

    const row = screen.getByRole('link', { name: /Attack on Israel/ }).closest('li')!;
    expect(row).toHaveClass('grid-cols-[18px_minmax(0,1fr)]', 'gap-x-3');
    expect(row).not.toHaveClass('-ml-[30px]');
  });

  it('draws the Claim page sub-claims with the Topic list rows', () => {
    render(
      <ClaimTemplate
        model={{
          id: 'claim-1',
          title: 'There is no genocide in Gaza',
          kind: 'judgment',
          split: split(5),
          voteBox: { userVote: null, countSummary: '5 votes', onVote: vi.fn() },
          subClaims: [
            { id: 's-1', title: 'Aid kept entering', kind: 'fact', stance: 'supports', split: split(4), sources: [] },
          ],
          sections: [],
        }}
      />
    );

    const supporting = screen.getByRole('region', { name: 'Supporting claims' });
    // The shared row draws the split twice: compact beside the row on desktop, full under it on phones.
    expect(within(supporting).getAllByRole('meter')).toHaveLength(2);
    // And keeps the Factual tag to wide rows, as quiet text in the result group.
    expect(within(supporting).getByText('Factual').closest('.hidden')).not.toBeNull();
  });

  it('shows the vote only on the filled button, with no "Change" line, and the buttons take a vote back', () => {
    const onVote = vi.fn();
    const onClear = vi.fn();
    render(
      <ClaimTemplate
        model={{
          id: 'claim-1',
          title: 'There is no genocide in Gaza',
          kind: 'judgment',
          split: split(5),
          voteBox: { userVote: 'disagree', countSummary: '5 votes', onVote, onClear },
          sections: [],
        }}
      />
    );

    const box = screen.getByRole('region', { name: 'Vote on this claim' });
    expect(within(box).queryByText(/^You:/)).toBeNull();
    expect(within(box).queryByText('You disagreed.')).toBeNull();
    expect(within(box).queryByRole('button', { name: 'Change' })).toBeNull();
    expect(within(box).getByRole('button', { name: 'Disagree' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(box).getByRole('button', { name: 'Disagree' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onVote).not.toHaveBeenCalled();

    fireEvent.click(within(box).getByRole('button', { name: 'Agree' }));
    expect(onVote).toHaveBeenCalledWith('agree');
  });

  it('names the sources section "Sources" and keeps its "+" adding a source (GEO-3846)', () => {
    render(
      <TopicTemplate
        model={{
          id: 'topic-gaza',
          title: 'Gaza',
          lede: '',
          sections: [{ id: 'sources', title: 'Sources', items: [] }],
        }}
      />
    );

    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
    expect(within(sources).getByRole('button', { name: 'Add source' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Evidence' })).toBeNull();
    expect(screen.queryByText(/Sources (&|and) evidence/)).toBeNull();
  });
});
