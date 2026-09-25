import { describe, expect, it } from 'vitest';

import { HIDDEN_FROM_PROFILE_PROPERTY } from '~/core/profile/profile-debate-visibility';

import {
  hiddenProfileRelationRowsConnection,
  hiddenProfileRelationTargetsConnection,
} from './hidden-profile-relations-query';

describe('hidden profile relation query', () => {
  it('scopes reads to relations authored by the profile in its own personal space', () => {
    const query = hiddenProfileRelationRowsConnection('profile-space');

    expect(query).toContain(`typeId: { is: "${HIDDEN_FROM_PROFILE_PROPERTY}" }`);
    expect(query).toContain('fromEntityId: { is: "profile-space" }');
    expect(query).toContain('spaceId: { is: "profile-space" }');
    expect(query).toContain('nodes { id spaceId toEntityId }');
  });

  it('offers the smaller target-only selection used by profile counts', () => {
    expect(hiddenProfileRelationTargetsConnection('profile-space')).toContain('nodes { toEntityId }');
  });
});
