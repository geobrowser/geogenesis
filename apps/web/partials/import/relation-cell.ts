/**
 * How a relation cell becomes one or more entity names.
 *
 * A relation column holds names, and how many names a cell holds is a property
 * of *that column*, not of punctuation in general. `"Chicago, Illinois, United
 * States"` is one place; `"Alice, Bob"` is two people; `"ceo/founder"` is two
 * roles. No single regex reads all three correctly, which is why the rule is
 * chosen per column at mapping time and carried through here.
 *
 * The earlier CSV pipeline hit exactly this and patched it by name — relation
 * properties pointing at `city|country|place|location` were exempted from
 * comma-splitting. That works until a `Company` column holds "Ben & Jerry's,
 * Inc.". The signal was right (the property knows how its cells read) but it
 * belonged in the mapping rather than in a hard-coded list of type names.
 *
 * `list` is the default and is what every existing caller gets, so the
 * standalone importer's behaviour is unchanged.
 */
export const RELATION_SPLIT_RULES = ['list', 'none', 'slash'] as const;

export type RelationSplitRule = (typeof RELATION_SPLIT_RULES)[number];

export function isRelationSplitRule(value: unknown): value is RelationSplitRule {
  return typeof value === 'string' && (RELATION_SPLIT_RULES as readonly string[]).includes(value);
}

const SEPARATORS: Record<RelationSplitRule, RegExp | null> = {
  list: /[,;|]/,
  none: null,
  // A superset of `list`: a column written "ceo/founder" may well also contain
  // "ceo, founder" a few rows down, and splitting only on the slash would leave
  // that row pointing at one entity named "ceo, founder".
  slash: /[,;|/]/,
};

/** Split a relation cell into entity names according to the column's rule. */
export function splitRelationCell(raw: string, rule: RelationSplitRule = 'list'): string[] {
  const separator = SEPARATORS[rule] ?? SEPARATORS.list;

  if (rule === 'none') {
    const whole = raw.trim();
    return whole ? [whole] : [];
  }

  return raw
    .split(separator as RegExp)
    .map(part => part.trim())
    .filter(Boolean);
}
