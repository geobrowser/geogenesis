import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditProfileStatus } from '~/core/hooks/use-edit-profile';
import { WEBSITE_PROPERTY } from '~/core/profile/profile-links';

import { LinksSection } from './profile-rail';

const SPACE_ID = '11111111111111111111111111111111';
const PERSON_ID = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  status: 'idle' as EditProfileStatus,
  errorMessage: null as string | null,
  values: [] as { property: { id: string }; value: string }[],
  publish: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: '11111111111111111111111111111111' }),
}));

vi.mock('~/core/database/entities', () => ({
  useEntity: () => ({ name: 'Preston', values: mocks.values }),
}));

vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useEntitySchemaWithGroups: () => ({
    propertyGroups: [{ name: 'Links', propertyIds: ['eed38e74e67946bf8a42ea3e4f8fb5fb'] }],
    schema: [{ id: 'eed38e74e67946bf8a42ea3e4f8fb5fb', name: 'Website' }],
  }),
}));

vi.mock('~/core/hooks/use-edit-profile', () => ({
  useEditProfile: () => ({
    canEdit: true,
    current: { name: 'Preston', tagline: 'Head of Product at Geo', description: 'A bio' },
    publish: mocks.publish,
    reset: mocks.reset,
    status: mocks.status,
    errorMessage: mocks.errorMessage,
  }),
}));

beforeEach(() => {
  mocks.status = 'idle';
  mocks.errorMessage = null;
  mocks.values = [{ property: { id: WEBSITE_PROPERTY }, value: 'old.example' }];
  mocks.publish.mockReset();
  mocks.publish.mockResolvedValue(undefined);
  mocks.reset.mockReset();
});

afterEach(cleanup);

describe('LinksSection publishing', () => {
  it('keeps a failed draft open and retries the same edit', async () => {
    const user = userEvent.setup();
    const view = render(
      <LinksSection
        links={[{ propertyId: WEBSITE_PROPERTY, label: 'Website', handle: 'old.example', href: 'https://old.example' }]}
        spaceId={SPACE_ID}
        personEntityId={PERSON_ID}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit links' }));
    const input = screen.getByRole('textbox', { name: 'Website' });
    await user.clear(input);
    await user.type(input, 'new.example');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Website' })).toHaveValue('new.example');

    // The optimistic store now contains the attempted value. It must not replace
    // the editing baseline or make the failed draft look successfully saved.
    mocks.values = [{ property: { id: WEBSITE_PROPERTY }, value: 'new.example' }];
    mocks.status = 'error';
    mocks.errorMessage = 'Couldn’t publish your profile. Your changes are still here — try again.';
    view.rerender(
      <LinksSection
        links={[{ propertyId: WEBSITE_PROPERTY, label: 'Website', handle: 'old.example', href: 'https://old.example' }]}
        spaceId={SPACE_ID}
        personEntityId={PERSON_ID}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your changes are still here');
    expect(screen.getByRole('textbox', { name: 'Website' })).toHaveValue('new.example');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.publish.mock.calls.at(-1)?.[1].values).toContainEqual(
      expect.objectContaining({ value: 'new.example' })
    );
    // A links edit goes out through the profile modal's own publish, so it carries every
    // header field it is not editing. Dropping one from the draft is how this card would
    // quietly delete somebody's tagline while saving a URL.
    expect(mocks.publish.mock.calls.at(-1)?.[0]).toEqual({
      name: 'Preston',
      tagline: 'Head of Product at Geo',
      description: 'A bio',
      banner: { kind: 'unchanged' },
      avatar: { kind: 'unchanged' },
    });
    expect(mocks.reset).not.toHaveBeenCalled();

    mocks.status = 'published';
    view.rerender(
      <LinksSection
        links={[{ propertyId: WEBSITE_PROPERTY, label: 'Website', handle: 'new.example', href: 'https://new.example' }]}
        spaceId={SPACE_ID}
        personEntityId={PERSON_ID}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit links' })).toBeInTheDocument());
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('rolls back the optimistic row when a failed edit is cancelled', async () => {
    const user = userEvent.setup();
    const view = render(
      <LinksSection
        links={[{ propertyId: WEBSITE_PROPERTY, label: 'Website', handle: 'old.example', href: 'https://old.example' }]}
        spaceId={SPACE_ID}
        personEntityId={PERSON_ID}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit links' }));
    mocks.status = 'error';
    mocks.errorMessage = 'Publish failed';
    view.rerender(
      <LinksSection
        links={[{ propertyId: WEBSITE_PROPERTY, label: 'Website', handle: 'old.example', href: 'https://old.example' }]}
        spaceId={SPACE_ID}
        personEntityId={PERSON_ID}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox', { name: 'Website' })).not.toBeInTheDocument();
  });
});
