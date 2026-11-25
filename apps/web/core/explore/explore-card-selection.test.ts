import { parse, visit } from 'graphql';
import { describe, expect, it } from 'vitest';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

/**
 * The card selection is assembled as a string, so nothing type-checks it — a stray brace or an
 * interpolation that resolves to nothing only shows up as a 500 from whichever route embeds it.
 * Parsing it here is the cheapest place to find that out.
 */
describe('explore card selection', () => {
  it('parses as a selection set', () => {
    expect(() => parse(`query { entities { ${exploreCardNodeFields('Frag')} } }`)).not.toThrow();
  });

  it('parses with lists unscoped, as the profile and topic feeds ask for it', () => {
    expect(() =>
      parse(`query { entities { ${exploreCardNodeFields('Frag', { scopeListsToSpaces: false })} } }`)
    ).not.toThrow();
  });

  it('parses its property fragment', () => {
    expect(() => parse(exploreCardPropertyFragment('Frag'))).not.toThrow();
  });

  it('asks for the activity totals a claim card shows', () => {
    const fields = exploreCardNodeFields('Frag');

    expect(fields).toContain('activityComments');
    expect(fields).toContain('activityDebates');
  });

  it('selects toEntityId on the type-filtered relationsList, so a target can be tied to its relation', () => {
    for (const options of [undefined, { scopeListsToSpaces: false }]) {
      const doc = parse(`query { entities { ${exploreCardNodeFields('Frag', options)} } }`);
      const found: string[][] = [];
      visit(doc, {
        Field(node) {
          if (node.name.value === 'relationsList' && node.selectionSet) {
            found.push(node.selectionSet.selections.map(sel => ('name' in sel ? sel.name.value : '')));
          }
        },
      });
      const withTarget = found.filter(names => names.includes('toEntity'));
      expect(withTarget).toHaveLength(1);
      expect(withTarget[0]).toContain('toEntityId');
    }
  });
});

// The documents that embed it are `parse`d at module load, so importing them is the assertion:
// a malformed selection throws here rather than as a 500 from the route that uses it.
describe('documents built from it', () => {
  it('parse at import time', async () => {
    await expect(import('./explore-best-document')).resolves.toBeDefined();
    await expect(import('./explore-entities-document')).resolves.toBeDefined();
    await expect(import('./explore-best-by-type-document')).resolves.toBeDefined();
    await expect(import('./explore-entities-by-property-document')).resolves.toBeDefined();
    await expect(import('./explore-topic-feed-document')).resolves.toBeDefined();
    await expect(import('./fetch-explore-feed')).resolves.toBeDefined();
  });
});
