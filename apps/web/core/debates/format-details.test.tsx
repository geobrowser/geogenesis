import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateFormatDetails, requestOpenRounds } from './format-details';

const participants = [
  { user_id: 'user-local', profile_space_id: 'profile-local', display_name: 'Local speaker', avatar_cid: null },
  { user_id: 'user-remote', profile_space_id: 'profile-remote', display_name: 'Remote speaker', avatar_cid: null },
];

afterEach(cleanup);

function renderDetails(props: Partial<React.ComponentProps<typeof DebateFormatDetails>>) {
  return render(
    <DebateFormatDetails formatId="standard" participants={participants} currentUserId="user-local" {...props} />
  );
}

describe('DebateFormatDetails', () => {
  it('shows Open rounds as two opening turns and optional rebuttal rounds, with the debate’s cap', () => {
    const { container } = renderDetails({
      formatId: 'open_rounds',
      openRounds: { max_rebuttal_rounds: 3, rebuttal_turn_ms: 45_000 },
    });

    expect(screen.getByText('You make an argument')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker makes an argument')).toBeInTheDocument();
    expect(screen.getAllByText('1m')).toHaveLength(2);
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('Then extend, round by round')).toBeInTheDocument();
    expect(screen.getByText('Both of you must pick Extend to add a round. Up to 3 rounds.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/clos/i);
  });

  it('reads Open rounds, and its rebuttal length, from the block even when the format id is missing', () => {
    const { container } = renderDetails({
      formatId: null,
      openRounds: { max_rebuttal_rounds: 10, rebuttal_turn_ms: 30_000 },
    });

    expect(screen.getByText('30s')).toBeInTheDocument();
    expect(screen.getByText('Both of you must pick Extend to add a round. Up to 10 rounds.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/clos/i);
  });

  // GEO-3201: the server decides the format and cap when the request is made.
  it('shows the cap a pending request carries', () => {
    renderDetails({ formatId: 'open_rounds', openRounds: requestOpenRounds({ max_rebuttal_rounds: 4 }) });

    expect(screen.getByText('Both of you must pick Extend to add a round. Up to 4 rounds.')).toBeInTheDocument();
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('builds no Open rounds block for a request without a cap', () => {
    expect(requestOpenRounds({ max_rebuttal_rounds: null })).toBeNull();
    expect(requestOpenRounds({})).toBeNull();
    expect(requestOpenRounds({ max_rebuttal_rounds: 0 })).toEqual({
      max_rebuttal_rounds: 0,
      required_rebuttal_rounds: 0,
      rebuttal_turn_ms: 45_000,
    });
  });

  it('lists the required rebuttal round as turns, then offers the rest of the cap as extensions', () => {
    const { container } = renderDetails({
      formatId: 'open_rounds',
      openRounds: requestOpenRounds({ max_rebuttal_rounds: 10, required_rebuttal_rounds: 1 }),
    });

    expect(screen.getByText('You make an argument')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker makes an argument')).toBeInTheDocument();
    expect(screen.getByText('You rebut')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker rebuts')).toBeInTheDocument();
    expect(screen.getAllByText('1m')).toHaveLength(2);
    // Two rebuttal turns, and the dashed row's turn length.
    expect(screen.getAllByText('45s')).toHaveLength(3);
    expect(screen.getByText('Then extend, round by round')).toBeInTheDocument();
    expect(screen.getByText('Both of you must pick Extend to add a round. Up to 9 more rounds.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/clos/i);
  });

  it('offers no extension when the cap is only the required rounds', () => {
    renderDetails({
      formatId: 'open_rounds',
      openRounds: { max_rebuttal_rounds: 1, required_rebuttal_rounds: 1, rebuttal_turn_ms: 45_000 },
    });

    expect(screen.getByText('Remote speaker rebuts')).toBeInTheDocument();
    expect(screen.queryByText('Then extend, round by round')).not.toBeInTheDocument();
  });

  // A request from an older server carries no cap; a number would be a guess.
  it('names no cap for an Open rounds request without one', () => {
    const { container } = renderDetails({ formatId: 'open_rounds' });

    expect(screen.getByText('Both of you must pick Extend to add a round.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Up to/);
    expect(container.textContent).not.toMatch(/clos/i);
  });

  it('never shows another format’s turns for a format it does not know', () => {
    const { container } = renderDetails({ formatId: 'some-future-format' });

    expect(screen.getByText(/can’t show this debate’s format/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/makes an argument|rebuts|clos/i);
  });

  it('condenses numbered rounds into one row each with the per-debater duration', () => {
    const { container } = renderDetails({
      formatId: 'open_rounds',
      openRounds: requestOpenRounds({
        max_rebuttal_rounds: 10,
        required_rebuttal_rounds: 2,
        turn_durations_ms: [60_000, 60_000, 45_000, 45_000, 30_000, 30_000],
      }),
    });
    for (const round of [1, 2, 3]) {
      expect(screen.getByText(`Round ${round}`)).toBeInTheDocument();
    }
    expect(screen.getByText('1m each')).toBeInTheDocument();
    expect(screen.getByText('45s each')).toBeInTheDocument();
    expect(screen.getByText('30s each')).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
    // Three required rounds and one extension row, regardless of the number of debaters.
    expect(container.firstElementChild?.children).toHaveLength(4);
    expect(screen.queryByText(/Local speaker|Remote speaker| · You/)).not.toBeInTheDocument();
    expect(screen.getByText('Both of you must pick Extend to add a round. Up to 8 more rounds.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/opening|rebut|clos/i);
  });

  it('keeps a legacy request with a custom required count at 45 seconds', () => {
    const { container } = renderDetails({
      formatId: 'open_rounds',
      openRounds: requestOpenRounds({ max_rebuttal_rounds: 10, required_rebuttal_rounds: 2 }),
    });
    expect(screen.getAllByText('45s')).toHaveLength(5);
    expect(screen.queryByText('30s')).not.toBeInTheDocument();
    expect(container.textContent).toContain('You rebut');
  });

  it('keeps the fixed formats’ turn lists', () => {
    renderDetails({ formatId: 'standard' });

    expect(screen.getByText('You make an argument')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker rebuts')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker closes to the audience')).toBeInTheDocument();
    expect(screen.queryByText('Then extend, round by round')).not.toBeInTheDocument();
  });
});
