import { describe, expect, it } from 'vitest';

import { bodyToDraft, draftToBody, mentionQueryAt, mentionedIds, messageSegments } from './mentions';

const ANN = '0191aaaa000070008000000000000001';
const ANN_DASHED = '0191aaaa-0000-7000-8000-000000000001';
const BO = '0191bbbb000070008000000000000002';

describe('mentions', () => {
  it('splits a body into text and mention tokens, dashed or dashless', () => {
    expect(messageSegments(`hi <@${ANN_DASHED}> and <@${BO}>!`)).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', personId: ANN },
      { kind: 'text', text: ' and ' },
      { kind: 'mention', personId: BO },
      { kind: 'text', text: '!' },
    ]);
    expect(messageSegments('<@not-an-id>')).toEqual([{ kind: 'text', text: '<@not-an-id>' }]);
    expect(mentionedIds(`<@${ANN}> <@${ANN_DASHED}>`)).toEqual([ANN]);
  });

  it('turns picked names into tokens, longest name first', () => {
    const mentions = [
      { personId: ANN, name: 'Ann' },
      { personId: BO, name: 'Ann Lee' },
    ];
    expect(draftToBody('@Ann Lee and @Ann', mentions)).toBe(`<@${BO}> and <@${ANN}>`);
    expect(draftToBody('no names', mentions)).toBe('no names');
  });

  it('turns tokens back into names for an edit, keeping unresolved ones', () => {
    const { draft, mentions } = bodyToDraft(`hi <@${ANN}> <@${BO}>`, id => (id === ANN ? 'Ann' : null));
    expect(draft).toBe(`hi @Ann <@${BO}>`);
    expect(mentions).toEqual([{ personId: ANN, name: 'Ann' }]);
    expect(draftToBody(draft, mentions)).toBe(`hi <@${ANN}> <@${BO}>`);
  });

  it('finds the @query the caret ends', () => {
    expect(mentionQueryAt('hello @an', 9)).toEqual({ start: 6, query: 'an' });
    expect(mentionQueryAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionQueryAt('mail@example', 12)).toBeNull();
    expect(mentionQueryAt('hello', 5)).toBeNull();
  });
});
