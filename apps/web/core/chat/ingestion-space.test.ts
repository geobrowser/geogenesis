import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ingestionChatContext, pickIngestionSpace } from './ingestion-space';

const mocks = vi.hoisted(() => ({ access: vi.fn(), ensure: vi.fn() }));

vi.mock('~/core/access/space-access', () => ({ getSpaceAccessById: mocks.access }));
vi.mock('~/core/access/request-space-membership', () => ({ ensureSpaceMembership: mocks.ensure }));

const PAGE_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSONAL_SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const PERSONAL_WRITE = { spaceId: PERSONAL_SPACE, personal: true };
const OTHER_SPACE = 'cccccccccccccccccccccccccccccccc';
const tx = vi.fn();

function pick(pageSpaceId: string | null = PAGE_SPACE) {
  return pickIngestionSpace({ pageSpaceId, personalSpaceId: PERSONAL_SPACE, tx, queryClient: new QueryClient() });
}

beforeEach(() => {
  mocks.access.mockReset();
  mocks.ensure.mockReset().mockResolvedValue(false);
});

describe('pickIngestionSpace', () => {
  it('a member of the page space imports into it, with no membership request', async () => {
    mocks.access.mockReturnValue(Effect.succeed({ canEdit: true }));

    expect(await pick()).toEqual({ spaceId: PAGE_SPACE, personal: false });
    expect(mocks.access).toHaveBeenCalledWith(PAGE_SPACE, PERSONAL_SPACE);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('a non-member imports into their personal space without waiting on the membership request', async () => {
    mocks.access.mockReturnValue(Effect.succeed({ canEdit: false }));
    // A request that never settles: the pick must not wait on it.
    mocks.ensure.mockReturnValue(new Promise(() => {}));

    expect(await pick()).toEqual(PERSONAL_WRITE);
    expect(mocks.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: PAGE_SPACE, personalSpaceId: PERSONAL_SPACE, tx })
    );
  });

  it('a failed access read imports into the personal space', async () => {
    mocks.access.mockReturnValue(Effect.fail(new Error('index down')));

    expect(await pick()).toEqual(PERSONAL_WRITE);
  });

  it('with no page space, imports into the personal space and requests nothing', async () => {
    expect(await pick(null)).toEqual(PERSONAL_WRITE);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});

describe('ingestionChatContext', () => {
  const onPage = (currentSpaceId: string) => ({
    currentSpaceId,
    currentEntityId: null,
    currentPath: '/',
    isEditMode: false,
  });

  it('with no pick (an Add data panel import), writes into the route space', () => {
    expect(ingestionChatContext(onPage(PAGE_SPACE), null)).toEqual({
      ...onPage(PAGE_SPACE),
      writeToPersonalSpace: false,
    });
  });

  it("a non-member's pick asks for the personal space, and leaves the route's space as context", () => {
    expect(ingestionChatContext(onPage(PAGE_SPACE), PERSONAL_WRITE)).toEqual({
      ...onPage(PAGE_SPACE),
      writeToPersonalSpace: true,
    });
  });

  it("a member's import queued on one page and replayed after moving to another space still writes into the page's space, unflagged", () => {
    expect(ingestionChatContext(onPage(OTHER_SPACE), { spaceId: PAGE_SPACE, personal: false })).toEqual({
      ...onPage(OTHER_SPACE),
      currentSpaceId: PAGE_SPACE,
      writeToPersonalSpace: false,
    });
  });

  it("a non-member's import replayed while on their own personal space's pages is still flagged", () => {
    expect(ingestionChatContext(onPage(PERSONAL_SPACE), PERSONAL_WRITE).writeToPersonalSpace).toBe(true);
  });
});
