'use client';

import * as React from 'react';

import cx from 'classnames';

/**
 * What the video ends on.
 *
 * Ordered by what it wants from the viewer rather than by what it has to report. The question
 * comes first, with the motion under it, because that is the thing the whole four minutes was
 * for and the moment they are best placed to answer it — a prompt below two scoreboards reads as
 * a footnote to the statistics, and "where do you stand" with nothing near it to stand on is a
 * question about nothing. Then the debaters, side by side, because the only useful way to read
 * one debater's figures is against the other's.
 *
 * One card across the whole player rather than a panel per tile. Two halves cannot put anything
 * above both of them, and the question has to sit above both.
 */
export type DebateEndCardSide = {
  name: string;
  avatar: React.ReactNode;
  claims: number;
  speakingTime: string | null;
  /**
   * How their claims were received.
   *
   * `percent` is the share of positive responses. `confident` says whether enough people have
   * answered to characterise that share — below the bar the card prints the raw counts instead,
   * because "2 of 3 agreed" is a fact and "67% agreed" off three responses is a figure pretending
   * to be a population.
   */
  agreement: { percent: number; positive: number; total: number; word: string; confident: boolean } | null;
  onOpenProfile: (event: React.MouseEvent) => void;
};

export function DebateEndCard({
  claim,
  prompt,
  responseControl,
  sides,
  replay,
}: {
  claim: string;
  prompt: string;
  /** The claim's own response control, so this cannot disagree with the pills below the player. */
  responseControl: React.ReactNode;
  sides: DebateEndCardSide[];
  replay: React.ReactNode;
}) {
  return (
    <div
      data-debate-end-card
      // The video behind is one large play/pause button, so the card takes no clicks and the two
      // things inside it that are controls take their own.
      className="pointer-events-none absolute inset-0 z-[14] flex flex-col items-center justify-center gap-5 overflow-y-auto bg-black/75 px-5 py-6 text-center backdrop-blur-[3px]"
    >
      <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-3">
        <span className="text-[0.6875rem] leading-none tracking-[0.14em] text-white/60 uppercase">{prompt}</span>
        {/* The motion itself, so the question has something to be about. Clamped rather than
            truncated: a claim runs to a sentence or two and the card has room for most of them,
            but not for the one that runs to five lines. */}
        <p className="line-clamp-3 text-[1.0625rem] leading-snug font-medium text-balance text-white">{claim}</p>
        <div onClick={event => event.stopPropagation()} className="flex justify-center">
          {responseControl}
        </div>
      </div>

      {/* Side by side at every width. Two debaters is the one comparison this card exists to make,
          and stacking them on a phone turns it into two readouts that happen to be near each
          other. They are narrow rather than stacked, which the figures survive — a name, a count
          and a share are all short. */}
      <div className="pointer-events-auto grid w-full max-w-md grid-cols-2 gap-3">
        {sides.map(side => (
          <EndCardSide key={side.name} side={side} />
        ))}
      </div>

      {/* The card owns its own way back. Centred under the figures rather than floating over the
          middle of the player, where it would land on top of them. */}
      <div className="pointer-events-auto">{replay}</div>
    </div>
  );
}

function EndCardSide({ side }: { side: DebateEndCardSide }) {
  return (
    <div data-scorecard={side.name} className="flex min-w-0 flex-col items-center gap-2">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          side.onOpenProfile(event);
        }}
        className="flex max-w-full items-center gap-1.5"
      >
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-white">{side.avatar}</span>
        <span className="truncate text-[0.8125rem] leading-none tracking-[-0.2px] text-white">{side.name}</span>
      </button>

      <div className="flex items-baseline gap-1">
        <span className="text-[1.75rem] leading-none font-bold text-white tabular-nums">{side.claims}</span>
        <span className="text-[0.75rem] leading-none text-white/70">{side.claims === 1 ? 'claim' : 'claims'}</span>
      </div>

      {side.speakingTime && (
        <span className="text-[0.6875rem] leading-none text-white/50 tabular-nums">{side.speakingTime} speaking</span>
      )}

      <AgreementSplit agreement={side.agreement} />
    </div>
  );
}

/**
 * The share of people who went with this debater, as a bar and a reading.
 *
 * Always drawn once anybody has answered, and this is the part that changed: it used to withhold
 * the whole thing below the confidence bar, which meant the card showed nothing at all on most
 * real debates — the responses a claim collects in its first days are counted in single figures.
 * A blank where a reading should be is not caution, it is a card that looks broken.
 *
 * So the bar is always there and the *sentence under it* changes. Above the bar it is a share:
 * "68% agreed", a statement about a population. Below it, the raw counts: "2 of 3 agreed", which
 * says exactly as much as it knows and no more.
 */
function AgreementSplit({ agreement }: { agreement: DebateEndCardSide['agreement'] }) {
  if (!agreement || agreement.total === 0) {
    return <span className="text-[0.6875rem] leading-none text-white/40">No responses yet</span>;
  }

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="flex h-1 w-full overflow-hidden rounded-full bg-white/20">
        <span
          className={cx('h-full rounded-full', agreement.confident ? 'bg-green' : 'bg-white/70')}
          style={{ width: `${agreement.percent}%` }}
        />
      </span>
      <span className="text-[0.6875rem] leading-none text-white/80 tabular-nums">
        {agreement.confident
          ? `${agreement.percent}% ${agreement.word}`
          : `${agreement.positive} of ${agreement.total} ${agreement.word}`}
      </span>
    </div>
  );
}
