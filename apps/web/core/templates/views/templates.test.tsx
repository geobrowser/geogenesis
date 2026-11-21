import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { type GazaFixtureRoute, useGazaFixtureTemplates } from '../adapters/gaza-fixture';
import type { TopicTemplateModel } from '../models';
import { ContextPeekDrawer } from '../primitives';
import { ClaimTemplate } from './claim-template';
import { DebateTemplate } from './debate-template';
import { EventTemplate } from './event-template';
import { NewsStoryTemplate } from './news-story-template';
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
  it('renders rankings and navigates Topic -> Claim -> Event -> Story -> Source', () => {
    render(<FixtureHarness />);

    expect(screen.getByRole('heading', { name: 'Israel–Gaza war' })).toBeInTheDocument();

    // Switch Rankings tab: Bridging picks hides single-scope community pills (Finding T6)
    const rankings = screen.getByRole('region', { name: 'Rankings' });
    fireEvent.click(within(rankings).getByRole('button', { name: /Bridging picks/i }));
    expect(within(rankings).queryByRole('button', { name: 'Everyone' })).toBeNull();

    // Switch community view, vote inline on a claim, and open it via the Claim Peek Drawer
    const communityBar = screen.getByRole('region', { name: 'Community view' });
    const proIsraelFilter = within(communityBar).getByRole('button', { name: /Pro-Israel/i });
    fireEvent.click(proIsraelFilter);
    expect(proIsraelFilter).toHaveAttribute('aria-pressed', 'true');

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

    fireEvent.click(within(claimsSection).getByRole('button', { name: /Israel is committing genocide in Gaza/i }));
    const claimDrawer = screen.getByRole('dialog');
    expect(within(claimDrawer).getByText('Contested claim')).toBeInTheDocument();
    fireEvent.click(within(claimDrawer).getByRole('button', { name: /Open full claim page/i }));
    expect(screen.getByText('Contested claim')).toBeInTheDocument();

    // Verify GraphConnectionsStrip + ContextPeekDrawer on Claim page
    const graphStrip = screen.getByRole('region', { name: 'Connected in the graph' });
    fireEvent.click(within(graphStrip).getByRole('button', { name: /International Court of Justice/i }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: 'International Court of Justice' })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));

    // Vote Agree
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(screen.getByText('You agreed.')).toBeInTheDocument();

    // Navigate from Claim -> Event -> News Story -> Source
    const eventsRegion = screen.getByRole('region', { name: 'Events' });
    fireEvent.click(within(eventsRegion).getByRole('button', { name: /ICJ orders Israel to prevent genocidal acts/i }));
    expect(screen.getByRole('heading', { name: 'ICJ orders Israel to prevent genocidal acts' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /World court orders Israel to prevent genocidal acts/i }));
    expect(screen.getByText('News story')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read on NPR/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ICJ order in South Africa v\. Israel/i }));
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
    fireEvent.click(screen.getByRole('button', { name: '+ Add context' }));
    fireEvent.click(screen.getByRole('button', { name: 'Missing context' }));
    fireEvent.change(screen.getByLabelText(/What do the sources show/i), {
      target: { value: 'Reverse image search confirms this footage was filmed in Aleppo in 2016.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit note' }));

    expect(screen.getByText('Your note · needs ratings')).toBeInTheDocument();
    expect(screen.getByText(/Reverse image search confirms this footage/i)).toBeInTheDocument();
  });

  it('renders agreed claim basis and peekable settling sources when inspecting a common-ground claim', () => {
    render(<FixtureHarness />);

    const claimsSection = screen.getByRole('region', { name: 'Claims' });
    fireEvent.click(within(claimsSection).getByRole('tab', { name: /Common ground/i }));
    fireEvent.click(
      within(claimsSection).getByRole('button', { name: /Most of Gaza’s buildings are damaged or destroyed/i })
    );

    // Clicking the claim row opens the ContextPeekDrawer with agreed basis & settling sources
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Agreed claim')).toBeInTheDocument();

    // Clicking a source chip inside the drawer drills into the source with a Back button
    fireEvent.click(within(drawer).getAllByRole('button', { name: /UNOSAT satellite damage assessment/i })[0]);
    expect(within(drawer).getByRole('heading', { name: 'UNOSAT satellite damage assessment' })).toBeInTheDocument();

    // Go back to claim in drawer, then open the full Claim page
    fireEvent.click(within(drawer).getByRole('button', { name: /Back/i }));
    fireEvent.click(within(drawer).getByRole('button', { name: /Open full claim page/i }));
    expect(screen.getByRole('heading', { name: 'Where they split next' })).toBeInTheDocument();
  });

  it('renders 10 claims, 8 timeline items, and orders Claims -> Timeline -> Sources -> Rankings cleanly', () => {
    render(<FixtureHarness />);

    expect(screen.queryByRole('region', { name: 'Who’s who' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coverage and agreement over time' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'What’s spreading' })).toBeNull();

    const claims = screen.getByRole('region', { name: 'Claims' });
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    const sources = screen.getByRole('region', { name: 'Sources & evidence' });
    const rankings = screen.getByRole('region', { name: 'Rankings' });

    expect(within(claims).getAllByRole('group', { name: /^Vote on /i })).toHaveLength(10);
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(8);
    expect(claims.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeline.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sources.compareDocumentPosition(rankings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Timeline shows concise event summaries without duplicating claim vote bars
    expect(within(timeline).queryAllByRole('meter')).toHaveLength(0);
    expect(
      within(timeline).getByText(/An Israeli military official accepted the Gaza Health Ministry/i)
    ).toBeInTheDocument();
  });

  it('navigates from Topic rankings to DebateTemplate and renders vote shifts', () => {
    render(<FixtureHarness />);

    const rankings = screen.getByRole('region', { name: 'Rankings' });
    fireEvent.click(within(rankings).getByRole('button', { name: /Best debates/i }));
    fireEvent.click(within(rankings).getByRole('button', { name: /Israel is committing genocide in Gaza/i }));

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
});
