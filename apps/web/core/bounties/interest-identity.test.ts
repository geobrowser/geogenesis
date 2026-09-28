import { describe, expect, it } from 'vitest';

import { filterOwnInterestRows } from './interest-identity';

const ME = 'aaaa0000000000000000000000000001';
const PERSON = 'bbbb0000000000000000000000000002';
const DAO = 'dddd0000000000000000000000000001';

describe('filterOwnInterestRows', () => {
  it("keeps rows in the viewer's personal space and legacy rows in the bounty's own space", () => {
    const rows = [
      { id: 'own-new', fromEntityId: ME, spaceId: ME },
      { id: 'own-legacy-person', fromEntityId: PERSON, spaceId: ME },
      { id: 'own-legacy-dao', fromEntityId: ME, spaceId: DAO },
      // Spoof: authored FROM the viewer's identity, but inside a stranger's space.
      { id: 'spoof', fromEntityId: ME, spaceId: 'attacker-space' },
      // Someone else entirely.
      { id: 'other', fromEntityId: 'cccc0000000000000000000000000003', spaceId: ME },
    ];
    const own = filterOwnInterestRows(rows, {
      identityIds: new Set([ME, PERSON]),
      personalSpaceId: ME,
      bountySpaceId: DAO,
    });
    expect(own.map(r => r.id)).toEqual(['own-new', 'own-legacy-person', 'own-legacy-dao']);
  });
});
