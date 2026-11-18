'use client';

/**
 * Shown in place of "Add my ranking" / "Rank" when the ranker's ballot exists
 * but couldn't be read whole (GEO-3680). Offering a fresh ballot there would
 * publish an empty or partial list over the real one.
 */
export function RankingBallotReadError({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry: () => Promise<unknown>;
  compact?: boolean;
}) {
  return (
    <span role="alert" className="flex min-w-0 items-center gap-2 text-metadata text-red-01">
      <span className={compact ? 'truncate' : undefined} title={compact ? message : undefined}>
        {compact ? "Couldn't load your ranking" : message}
      </span>
      <button
        type="button"
        className="shrink-0 underline"
        onClick={() => {
          void onRetry().catch(() => undefined);
        }}
      >
        Try again
      </button>
    </span>
  );
}
