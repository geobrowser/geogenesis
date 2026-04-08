import { describe, expect, it } from 'vitest';

import { validateEntityId } from '~/core/utils/utils';

import { generateOpsForSpaceType } from './generate-ops-for-space-type';

describe('generateOpsForSpaceType', () => {
  it('reuses the provided topicId as the created entity id', async () => {
    const topicId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const result = await generateOpsForSpaceType({
      type: 'personal',
      spaceName: 'Test Space',
      spaceAvatarUri: null,
      spaceCoverUri: null,
      initialEditorAddress: '0x1111111111111111111111111111111111111111',
      topicId,
    });

    expect(result.topicId).toBe(topicId);
    expect(result.ops.length).toBeGreaterThan(0);
  });

  it('generates a valid topicId when no existing topic is selected', async () => {
    const result = await generateOpsForSpaceType({
      type: 'personal',
      spaceName: 'Generated Topic Space',
      spaceAvatarUri: null,
      spaceCoverUri: null,
      initialEditorAddress: '0x1111111111111111111111111111111111111111',
    });

    expect(validateEntityId(result.topicId)).toBe(true);
    expect(result.ops.length).toBeGreaterThan(0);
  });
});
