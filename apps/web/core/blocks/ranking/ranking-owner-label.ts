function firstName(name: string): string {
  return name.trim().split(/\s+/).find(Boolean)?.replace(/^@+/, '') ?? '';
}

export function formatSharedRankingOwnerLabel(authorName: string): string {
  const first = firstName(authorName);
  if (!first) return 'Ranking';
  const possessive = first.endsWith('s') || first.endsWith('S') ? `${first}'` : `${first}'s`;
  return `${possessive} ranking`;
}
