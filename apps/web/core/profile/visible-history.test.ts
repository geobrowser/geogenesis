import { describe, expect, it } from 'vitest';

import type { EmploymentCard } from './normalize-history';
import { visibleHistoryCards } from './visible-history';

/** One organisation carrying `roles` rows. Only the counts matter here. */
const card = (org: string, roles: number): EmploymentCard =>
  ({
    organization: { id: `org-${org}`, name: org },
    avatarUrl: null,
    edges: [],
    entries: Array.from({ length: roles }, (_, index) => ({ relationId: `${org}-${index}` })),
  }) as unknown as EmploymentCard;

const names = (cards: EmploymentCard[]) => cards.map(c => c.organization.name);

describe('visibleHistoryCards', () => {
  it('counts rows rather than organisations', () => {
    // Five companies with one role each is five rows, so all five show. The rule
    // this replaced counted cards and stopped at two.
    const cards = [card('a', 1), card('b', 1), card('c', 1), card('d', 1), card('e', 1), card('f', 1)];

    expect(names(visibleHistoryCards(cards))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('takes a whole organisation or none of it', () => {
    // Three roles then three more is six, one over. Showing two of the second
    // company's three would read as a gap in their history rather than as a list
    // that continues.
    expect(names(visibleHistoryCards([card('a', 3), card('b', 3)]))).toEqual(['a']);
  });

  it('fits an organisation that lands exactly on the limit', () => {
    expect(names(visibleHistoryCards([card('a', 2), card('b', 3), card('c', 1)]))).toEqual(['a', 'b']);
  });

  it('always shows the first, however long its run', () => {
    // A six-role run at one employer is over the limit on its own. Cutting it is
    // the thing the rule above exists to prevent, so the section opens on all
    // six rather than on nothing.
    expect(names(visibleHistoryCards([card('a', 6), card('b', 1)]))).toEqual(['a']);
    expect(visibleHistoryCards([card('a', 6)])[0].entries).toHaveLength(6);
  });

  it('shows everything when everything fits', () => {
    expect(names(visibleHistoryCards([card('a', 2), card('b', 2)]))).toEqual(['a', 'b']);
  });

  it('has nothing to show for nothing', () => {
    expect(visibleHistoryCards([])).toEqual([]);
  });
});
