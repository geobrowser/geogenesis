import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavUtils } from '~/core/utils/utils';

const mocks = vi.hoisted(() => ({ opened: vi.fn() }));

vi.mock('~/core/analytics', () => ({ personProfileOpened: mocks.opened }));

const { RequestParties } = await import('./request-parties');

const ME = {
  user_id: 'user-me',
  profile_space_id: '019fedae-72b6-7ab2-927a-df044d57c567',
  display_name: 'Me',
  avatar_cid: null,
};
const ADA = {
  user_id: 'user-ada',
  profile_space_id: '019fedae-72b6-7ab2-927a-df044d57c566',
  display_name: 'Ada',
  avatar_cid: null,
};

afterEach(() => {
  cleanup();
  mocks.opened.mockReset();
});

describe('RequestParties', () => {
  it("links the opponent's name to their profile", () => {
    render(<RequestParties viewer={ME} opponent={ADA} showPositions={false} />);

    const link = screen.getByRole('link', { name: 'Ada' });
    expect(link).toHaveAttribute('href', NavUtils.toSpace(ADA.profile_space_id));
    expect(link).not.toHaveAttribute('target');
  });

  it("leaves the viewer's own side unlinked", () => {
    render(<RequestParties viewer={ME} opponent={ADA} showPositions={false} />);

    expect(screen.getByText('You').closest('a')).toBeNull();
  });

  it('reports the profile open', () => {
    render(<RequestParties viewer={ME} opponent={ADA} showPositions={false} />);

    screen.getByRole('link', { name: 'Ada' }).click();

    expect(mocks.opened).toHaveBeenCalledWith(ADA.profile_space_id, null, {
      interaction_surface: 'debates_request_parties',
    });
  });

  // Inside a live debate room, following the name in place would drop the viewer out of it.
  it('opens a new tab when asked to', () => {
    render(<RequestParties viewer={ME} opponent={ADA} showPositions={false} profileLinkTarget="_blank" />);

    const link = screen.getByRole('link', { name: 'Ada' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('draws a bare name when there is no space to link to', () => {
    render(<RequestParties viewer={ME} opponent={{ ...ADA, profile_space_id: '' }} showPositions={false} />);

    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
