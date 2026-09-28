/**
 * How old something in a comment thread is, as the thread says it.
 *
 * Shared so every row in the thread ages the same way. The claim page's activity feed puts debates
 * in this list beside comments, and a debate dated "Sep 17, 2026" next to a comment aged "1d ago"
 * reads as two lists that happen to be adjacent rather than one thread.
 *
 * Recent times are deliberately coarse — "3 hours", not "3h 12m". This is a timestamp a reader
 * glances at to place a row relative to the ones around it, not a duration they are measuring.
 */
export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes > 1 ? 's' : ''}`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}
