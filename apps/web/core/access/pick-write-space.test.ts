import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PageSpaceWriters, pickWriteSpace } from './pick-write-space';

const mocks = vi.hoisted(() => ({ access: vi.fn(), ensure: vi.fn() }));

vi.mock('~/core/access/space-access', () => ({ getSpaceAccessById: mocks.access }));
vi.mock('~/core/access/request-space-membership', () => ({ ensureSpaceMembership: mocks.ensure }));

const PAGE_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSONAL_SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const PAGE_WRITE = { spaceId: PAGE_SPACE, personal: false };
const PERSONAL_WRITE = { spaceId: PERSONAL_SPACE, personal: true };
const tx = vi.fn();

function access(role: 'editor' | 'member' | 'none') {
  const isEditor = role === 'editor';
  const isMember = role !== 'none';
  mocks.access.mockReturnValue(Effect.succeed({ isEditor, isMember, canEdit: isEditor || isMember }));
}

function pick(writers: PageSpaceWriters, pageSpaceId: string | null = PAGE_SPACE) {
  return pickWriteSpace({
    pageSpaceId,
    personalSpaceId: PERSONAL_SPACE,
    writers,
    tx,
    queryClient: new QueryClient(),
  });
}

beforeEach(() => {
  mocks.access.mockReset();
  mocks.ensure.mockReset().mockResolvedValue(false);
});

describe("pickWriteSpace with 'editors' (template Add claim / Add event)", () => {
  it("an editor writes into the page's space", async () => {
    access('editor');
    expect(await pick('editors')).toEqual(PAGE_WRITE);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('a member who is not an editor writes into their personal space, and is not asked to join again', async () => {
    access('member');
    expect(await pick('editors')).toEqual(PERSONAL_WRITE);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('a non-member writes into their personal space, with a join request in the background', async () => {
    access('none');
    mocks.ensure.mockReturnValue(new Promise(() => {}));
    expect(await pick('editors')).toEqual(PERSONAL_WRITE);
    expect(mocks.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: PAGE_SPACE, personalSpaceId: PERSONAL_SPACE })
    );
  });

  it('a failed access read writes into the personal space', async () => {
    mocks.access.mockReturnValue(Effect.fail(new Error('index down')));
    expect(await pick('editors')).toEqual(PERSONAL_WRITE);
  });

  it('with no page space, writes into the personal space and reads nothing', async () => {
    expect(await pick('editors', null)).toEqual(PERSONAL_WRITE);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});

describe("pickWriteSpace with 'members' (Sources imports)", () => {
  it("a member who is not an editor still writes into the page's space", async () => {
    access('member');
    expect(await pick('members')).toEqual(PAGE_WRITE);
  });

  it('a non-member writes into their personal space, with a join request', async () => {
    access('none');
    expect(await pick('members')).toEqual(PERSONAL_WRITE);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
  });
});
