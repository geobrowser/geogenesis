import { describe, expect, it } from 'vitest';

import { copyTeamOrderToDraft } from './copy-team-order';

describe('copyTeamOrderToDraft', () => {
  it('copies the team order as it stands, without the debates the viewer pushed down', () => {
    const result = copyTeamOrderToDraft({ teamOrder: ['a', 'b', 'c', 'd'], pushedDownIds: ['c'], maxItems: 100 });
    expect(result).toEqual({ ids: ['a', 'b', 'd'], available: 3, capped: false });
  });

  it('keeps to the ballot cap, taking the top of the order', () => {
    const result = copyTeamOrderToDraft({ teamOrder: ['a', 'b', 'c', 'd'], pushedDownIds: [], maxItems: 2 });
    expect(result).toEqual({ ids: ['a', 'b'], available: 4, capped: true });
  });

  it('matches pushed-down ids whatever their form, and drops repeats', () => {
    const id = '0f6b9a3c-1234-4abc-8def-0123456789ab';
    const hex = id.replaceAll('-', '');
    const result = copyTeamOrderToDraft({ teamOrder: [id, 'b', 'b'], pushedDownIds: [hex], maxItems: 10 });
    expect(result.ids).toEqual(['b']);
  });
});
