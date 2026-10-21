import { describe, expect, it, vi } from 'vitest';

import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';

import { DEBATE_TYPE_ID } from '../ontology';
import { publishedDebatePath } from './published-debate-path';

// GEO-3435: a recording link (`/space/<space>/debates/<debate>/recording`) opens the debate's own
// page once the debate is on the graph, and stays on the recording until then.

const SPACE_ID = '4582fbbee28a16589154f7e36f1ee3c5';
const DEBATE_ID = '01a13b2c93b4702384da0926a56c265a';
const DEBATE_PAGE = `/space/${SPACE_ID}/${DEBATE_ID}`;

const debateEntity = (extra: { types?: { id: string }[]; values?: unknown[] } = {}) => ({
  types: extra.types ?? [{ id: DEBATE_TYPE_ID }],
  values: extra.values ?? [],
});

const path = (fetchEntity: (entityId: string, spaceId: string) => Promise<unknown>, query = '') =>
  publishedDebatePath(
    SPACE_ID,
    DEBATE_ID,
    new URLSearchParams(query),
    fetchEntity as Parameters<typeof publishedDebatePath>[3]
  );

describe('publishedDebatePath (GEO-3435)', () => {
  it('opens the debate page once the debate is on the graph, asking for it in its space', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(debateEntity());

    await expect(path(fetchEntity)).resolves.toBe(DEBATE_PAGE);
    expect(fetchEntity).toHaveBeenCalledWith(DEBATE_ID, SPACE_ID);
  });

  it('stays on the recording while the debate is not on the graph yet', async () => {
    await expect(path(vi.fn().mockResolvedValue(null))).resolves.toBeNull();
  });

  it('stays on the recording when the entity at that id is not a Debate', async () => {
    await expect(
      path(vi.fn().mockResolvedValue(debateEntity({ types: [{ id: 'some-other-type' }] })))
    ).resolves.toBeNull();
  });

  it('stays on the recording for a hidden debate, whose page would 404', async () => {
    const hidden = debateEntity({ values: [{ property: { id: HIDDEN_PROPERTY_ID }, value: 'true' }] });
    await expect(path(vi.fn().mockResolvedValue(hidden))).resolves.toBeNull();
  });

  it('stays on the recording when the graph cannot be reached, rather than failing the page', async () => {
    await expect(path(vi.fn().mockRejectedValue(new Error('graph down')))).resolves.toBeNull();
  });

  it('carries the link’s query over, repeated keys included', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(debateEntity());

    await expect(path(fetchEntity, 't=42&ref_email=debate_ready&tag=a&tag=b')).resolves.toBe(
      `${DEBATE_PAGE}?t=42&ref_email=debate_ready&tag=a&tag=b`
    );
  });
});
