import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { useGazaFixtureTemplates } from '../adapters/gaza-fixture';
import type { TopicTemplateModel } from '../models';
import { ClaimTemplate } from './claim-template';
import { TopicTemplate } from './topic-template';

afterEach(cleanup);

function FixtureHarness() {
  const fixture = useGazaFixtureTemplates();
  if (fixture.activeRoute.kind === 'topic' && fixture.topicSource.data) {
    return <TopicTemplate model={fixture.topicSource.data} />;
  }
  if (fixture.claimSource.data) {
    return <ClaimTemplate model={fixture.claimSource.data} />;
  }
  return null;
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
    expect(screen.queryByRole('heading', { name: 'Common ground' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'In each community’s own words' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'How we got here' })).toBeNull();
  });
});

describe('TopicTemplate ↔ ClaimTemplate fixture round-trip', () => {
  it('navigates from a contested claim card into ClaimTemplate, votes, and returns via breadcrumb', () => {
    render(<FixtureHarness />);

    expect(screen.getByRole('heading', { name: 'Israel–Gaza war' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where they split' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Common ground' })).toBeInTheDocument();

    // Switch community view and verify lede + pressed state update
    const communityBar = screen.getByRole('region', { name: 'Community view' });
    const proIsraelFilter = within(communityBar).getByRole('button', { name: /Pro-Israel/i });
    fireEvent.click(proIsraelFilter);
    expect(proIsraelFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/claims ordered by what this community pins first/i)).toBeInTheDocument();

    // Open lead claim ("Israel is committing genocide in Gaza")
    fireEvent.click(screen.getByRole('button', { name: /Israel is committing genocide in Gaza/i }));

    expect(screen.getByRole('heading', { name: 'Israel is committing genocide in Gaza' })).toBeInTheDocument();
    expect(screen.getByText('Contested claim')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Strongest cases' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The facts it turns on' })).toBeInTheDocument();

    // Vote Agree and verify live feedback
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(screen.getByText('You agreed.')).toBeInTheDocument();
    expect(screen.getByText(/Counted in Everyone/i)).toBeInTheDocument();

    // Return to topic via breadcrumb
    fireEvent.click(screen.getByRole('button', { name: 'Israel–Gaza war' }));
    expect(screen.getByRole('heading', { name: 'Israel–Gaza war' })).toBeInTheDocument();
  });

  it('renders agreed claim basis and settling sources when opening a common-ground claim', () => {
    render(<FixtureHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Most of Gaza’s buildings are damaged or destroyed/i }));

    expect(screen.getByText('Agreed claim')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What both communities agree on' })).toBeInTheDocument();
    expect(screen.getByText(/UNOSAT satellite damage assessment \(Jun 2026\)/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where they split next' })).toBeInTheDocument();
  });
});
