/**
 * GEO-3070. Explore's Best feed opens on a debate whose video plays.
 *
 * Debates are what a visitor should see first, and the ranking's debate weight makes one likely at
 * the top but not certain. So this moves the highest-ranked playable debate to the front of the
 * ranked window, after the type mix and space quota have run.
 *
 * - **A move, not a copy.** The debate leaves its ranked position, so it cannot appear twice.
 * - **Rank order decides which one.** The same debate leads for everyone until scores move, which
 *   is predictable and needs no state. Rotating among the top few is a later choice if the top slot
 *   goes stale.
 * - **Playable is checked, not assumed.** The publisher only writes a Debate to the graph once its
 *   final video exists, so nearly every candidate passes; the check catches the exceptions, such as
 *   a debate hidden since (`ensure_debate_readable` answers 404) or one whose media was rebuilt.
 * - **Nothing is ever worse than before.** No playable debate among the candidates, geo-chat down,
 *   or the check too slow: the window comes back exactly as ranked, with no gap at the top.
 */

/** How many of the highest-ranked debates to check. Past this many failures, give up. */
export const LEAD_DEBATE_CANDIDATES = 6;

/** The whole check's budget. geo-chat answers in tens of milliseconds; this is for when it doesn't. */
export const LEAD_DEBATE_TIMEOUT_MS = 1500;

export async function leadWithPlayableDebate<T>(
  rows: readonly T[],
  options: {
    isDebate: (row: T) => boolean;
    /** Resolves true when the debate has a processed video. A rejection counts as not playable. */
    isPlayable: (row: T, signal: AbortSignal) => Promise<boolean>;
    candidates?: number;
    timeoutMs?: number;
  }
): Promise<T[]> {
  const candidates = rows.filter(options.isDebate).slice(0, options.candidates ?? LEAD_DEBATE_CANDIDATES);
  if (candidates.length === 0) return [...rows];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? LEAD_DEBATE_TIMEOUT_MS);
  // Checked together rather than one after another, so a slow first candidate does not use the
  // budget the second needed. The winner is still the highest-ranked one that passed.
  const timedOut = new Promise<'timeout'>(resolve =>
    controller.signal.addEventListener('abort', () => resolve('timeout'), { once: true })
  );

  try {
    const verdicts = await Promise.race([
      Promise.all(candidates.map(row => options.isPlayable(row, controller.signal).catch(() => false))),
      timedOut,
    ]);
    if (verdicts === 'timeout') return [...rows];

    const lead = candidates.find((_, index) => verdicts[index]);
    if (lead === undefined) return [...rows];

    return [lead, ...rows.filter(row => row !== lead)];
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
