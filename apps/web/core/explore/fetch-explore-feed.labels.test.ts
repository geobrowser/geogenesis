import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from './explore-card-item';

const mocks = vi.hoisted(() => ({ getSpaces: vi.fn() }));
vi.mock('~/core/io/queries', () => ({ getSpaces: mocks.getSpaces }));

const { withOutsideSpaceLabels } = await import('./fetch-explore-feed');

const DEBATES = '9284477c8fe746368698994e2e517b32';
const US_POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';

const row = (spaceId: string) => ({ spaceId }) as ExploreFeedRow;
const sidebar = () => new Map([[DEBATES, { name: 'Debates', image: null }]]);

describe('withOutsideSpaceLabels', () => {
  beforeEach(() => mocks.getSpaces.mockReset());

  it('asks for nothing when every row is in the sidebar', async () => {
    const meta = sidebar();

    expect(await withOutsideSpaceLabels(meta, [row(DEBATES)])).toBe(meta);
    expect(mocks.getSpaces).not.toHaveBeenCalled();
  });

  it('labels a row whose space is outside the sidebar', async () => {
    mocks.getSpaces.mockReturnValue(
      Effect.succeed([{ id: US_POLITICS, entity: { name: 'US Politics', image: 'ipfs://cover' } }])
    );

    const labels = await withOutsideSpaceLabels(sidebar(), [row(DEBATES), row(US_POLITICS), row(US_POLITICS)]);

    expect(mocks.getSpaces).toHaveBeenCalledWith({ spaceIds: [US_POLITICS] });
    expect(labels.get(US_POLITICS)).toEqual({ name: 'US Politics', image: 'ipfs://cover' });
    expect(labels.get(DEBATES)?.name).toBe('Debates');
  });

  it('keeps the sidebar labels when the lookup fails', async () => {
    mocks.getSpaces.mockReturnValue(Effect.fail(new Error('graph down')));
    const meta = sidebar();

    expect(await withOutsideSpaceLabels(meta, [row(US_POLITICS)])).toBe(meta);
  });
});
