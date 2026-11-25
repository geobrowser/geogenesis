'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TimelineTemplateModel, TimelineTurnModel } from '../models';
import { ArrowRightIcon, ExpandableLede, TEMPLATE_CARD_SURFACE, TemplateBadge, TemplateShell } from '../primitives';

export interface TimelineTemplateProps {
  model: TimelineTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Full topic Timeline template.
 *
 * Renders a true continuous vertical timeline with era milestones, solid/hollow node markers on
 * a hairline spine, era filter strip, Key turns vs. Everything toggle, side-by-side community
 * framings, Known / Disputed / Unknown breakdowns, and sticky Key numbers rail.
 */
export function TimelineTemplate({ model, headerActions, footer, className }: TimelineTemplateProps) {
  const [selectedEraId, setSelectedEraId] = React.useState<string | 'all'>('all');
  const [keyOnly, setKeyOnly] = React.useState(true);
  const [showFramings, setShowFramings] = React.useState(false);

  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [draftDate, setDraftDate] = React.useState('');
  const [draftSummary, setDraftSummary] = React.useState('');
  const [draftSource, setDraftSource] = React.useState('');
  const [submittedNotice, setSubmittedNotice] = React.useState(false);

  const erasNewestFirst = React.useMemo(() => [...model.eras].reverse(), [model.eras]);

  const groupedEras = React.useMemo(() => {
    return erasNewestFirst
      .filter(era => selectedEraId === 'all' || era.id === selectedEraId)
      .map(era => ({
        era,
        turns: model.turns.filter(turn => turn.eraId === era.id && (!keyOnly || turn.isKey)).reverse(),
      }))
      .filter(group => group.turns.length > 0);
  }, [erasNewestFirst, keyOnly, model.turns, selectedEraId]);

  const handleSuggestSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftDate.trim() || !draftSummary.trim()) return;
    model.onSuggestTurn?.({
      date: draftDate.trim(),
      summary: draftSummary.trim(),
      source: draftSource.trim(),
    });
    setDraftDate('');
    setDraftSummary('');
    setDraftSource('');
    setSuggestOpen(false);
    setSubmittedNotice(true);
  };

  return (
    <TemplateShell maxWidth={1120} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Header */}
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TemplateBadge tone="event">Timeline</TemplateBadge>
            <TemplateBadge tone="neutral">{model.turns.length} turns</TemplateBadge>
          </div>
          {headerActions}
        </div>
        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
        {model.lede && <ExpandableLede text={model.lede} />}
      </header>

      {/* Filter controls */}
      <section aria-label="Timeline filters" className="flex flex-col gap-3.5 border-y border-divider py-4">
        {/* Equal-width segmented era strip */}
        <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-3 @[920px]:grid-cols-6">
          <button
            type="button"
            aria-pressed={selectedEraId === 'all'}
            onClick={() => setSelectedEraId('all')}
            className={cx(
              'flex cursor-pointer flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-all',
              selectedEraId === 'all'
                ? 'border-text bg-text text-white shadow-[0_2px_10px_rgba(0,0,0,0.12)]'
                : 'border-black/[0.04] bg-grey-01/80 text-text hover:bg-grey-01'
            )}
          >
            <span className="text-[13.5px] font-semibold">All</span>
            <span className={cx('text-[12.5px]', selectedEraId === 'all' ? 'text-white/75' : 'text-grey-04')}>
              Every era
            </span>
          </button>
          {erasNewestFirst.map(era => (
            <button
              key={era.id}
              type="button"
              aria-pressed={selectedEraId === era.id}
              onClick={() => setSelectedEraId(era.id)}
              className={cx(
                'flex cursor-pointer flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-all',
                selectedEraId === era.id
                  ? 'border-text bg-text text-white shadow-[0_2px_10px_rgba(0,0,0,0.12)]'
                  : 'border-black/[0.04] bg-grey-01/80 text-text hover:bg-grey-01'
              )}
            >
              <span className="text-[13.5px] font-semibold">{era.years}</span>
              <span
                className={cx(
                  'line-clamp-1 text-[12.5px]',
                  selectedEraId === era.id ? 'text-white/75' : 'text-grey-04'
                )}
              >
                {era.name}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-grey-02 bg-bg p-0.5">
            <button
              type="button"
              aria-pressed={keyOnly}
              onClick={() => setKeyOnly(true)}
              className={cx(
                'cursor-pointer rounded-full border-0 px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                keyOnly ? 'bg-text text-white' : 'bg-transparent text-grey-04 hover:text-text'
              )}
            >
              Key turns
            </button>
            <button
              type="button"
              aria-pressed={!keyOnly}
              onClick={() => setKeyOnly(false)}
              className={cx(
                'cursor-pointer rounded-full border-0 px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                !keyOnly ? 'bg-text text-white' : 'bg-transparent text-grey-04 hover:text-text'
              )}
            >
              Everything ({model.turns.length})
            </button>
          </div>

          <button
            type="button"
            aria-pressed={showFramings}
            onClick={() => setShowFramings(prev => !prev)}
            className={cx(
              'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
              showFramings
                ? 'border-purple bg-purple-tint text-purple'
                : 'border-grey-02 bg-white text-text hover:border-text'
            )}
          >
            {showFramings ? 'Hide how each community tells it' : 'Show how each community tells it'}
          </button>
        </div>
      </section>

      {/* Main vertical timeline + Key numbers rail */}
      <div className="grid grid-cols-1 items-start gap-8 @[900px]:grid-cols-[minmax(0,1fr)_310px]">
        <div className="flex min-w-0 flex-col gap-10">
          {groupedEras.map(({ era, turns }) => (
            <section key={era.id} aria-label={era.name} className="flex flex-col gap-5">
              {/* Era header anchored above the spine */}
              <div className="flex flex-col gap-1 border-b border-divider pb-3">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="rounded-md bg-ctaTertiary px-2 py-0.5 text-[13px] font-semibold text-ctaPrimary">
                    {era.years}
                  </span>
                  <h2 className="m-0 text-mediumTitle font-semibold text-text">{era.name}</h2>
                </div>
                <p className="m-0 text-[14.5px] leading-[21px] text-grey-04">{era.blurb}</p>
              </div>

              {/* Continuous vertical timeline rail */}
              <ol className="m-0 flex list-none flex-col p-0">
                {turns.map((turn, index) => (
                  <TimelineTurnItem
                    key={turn.id}
                    turn={turn}
                    showFramings={showFramings}
                    isFirst={index === 0}
                    isLast={index === turns.length - 1}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>

        {/* Right rail: Key numbers & Suggest a turn */}
        <aside className="flex flex-col gap-5 @[900px]:sticky @[900px]:top-16">
          {model.keyNumbers && model.keyNumbers.length > 0 && (
            <div className={cx('flex flex-col gap-4 p-5', TEMPLATE_CARD_SURFACE)}>
              <h2 className="m-0 text-smallTitle text-text">The numbers, and who says them</h2>
              <dl className="m-0 flex flex-col divide-y divide-divider">
                {model.keyNumbers.map(item => (
                  <div key={item.label} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <dt className="flex flex-col gap-0.5 text-[14px] leading-[19px] text-text">
                      <span>{item.label}</span>
                      <span className="text-[13px] text-grey-04">{item.attribution}</span>
                    </dt>
                    <dd className="m-0 shrink-0 text-right text-[15px] font-semibold text-text tabular-nums">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {model.onSuggestTurn && (
            <div className="flex flex-col gap-3 rounded-xl bg-grey-01/75 p-5">
              <h3 className="m-0 text-[16px] font-semibold text-text">Something missing or wrong?</h3>
              <p className="m-0 text-[14px] leading-[20px] text-grey-04">
                Suggest a turn or correction with a source. It appears once people in both communities rate it accurate.
              </p>

              {!suggestOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setSuggestOpen(true);
                    setSubmittedNotice(false);
                  }}
                  className="inline-flex h-9 cursor-pointer items-center self-start rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white hover:opacity-90"
                >
                  Suggest a turn
                </button>
              ) : (
                <form onSubmit={handleSuggestSubmit} className="flex flex-col gap-2.5">
                  <input
                    type="text"
                    value={draftDate}
                    onChange={e => setDraftDate(e.target.value)}
                    placeholder="Date (e.g. 14 Nov 2026)"
                    className="w-full rounded-lg border border-grey-02 bg-white px-3 py-2 text-[14.5px] text-text focus:border-text focus:outline-hidden md:text-[16px]"
                  />
                  <textarea
                    rows={2}
                    value={draftSummary}
                    onChange={e => setDraftSummary(e.target.value)}
                    placeholder="What happened and why it matters"
                    className="w-full rounded-lg border border-grey-02 bg-white px-3 py-2 text-[14.5px] text-text focus:border-text focus:outline-hidden md:text-[16px]"
                  />
                  <input
                    type="text"
                    value={draftSource}
                    onChange={e => setDraftSource(e.target.value)}
                    placeholder="Source (optional)"
                    className="w-full rounded-lg border border-grey-02 bg-white px-3 py-2 text-[14.5px] text-text focus:border-text focus:outline-hidden md:text-[16px]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white hover:opacity-90"
                    >
                      Submit
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestOpen(false)}
                      className="cursor-pointer border-0 bg-transparent px-2 text-[14px] text-grey-04 hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {submittedNotice && (
                <p className="m-0 text-[14px] font-medium text-ctaPrimary">Suggestion recorded for community review.</p>
              )}
            </div>
          )}
        </aside>
      </div>

      {footer}
    </TemplateShell>
  );
}

function TimelineTurnItem({
  turn,
  showFramings,
  isFirst,
  isLast,
}: {
  turn: TimelineTurnModel;
  showFramings: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const titleNode = (
    <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-pretty text-text">{turn.title}</h3>
  );

  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-3.5 @[640px]:grid-cols-[112px_28px_minmax(0,1fr)] @[640px]:gap-4">
      {/* Desktop date column */}
      <div className="hidden pt-1 text-right @[640px]:block">
        <time className="text-[14px] font-semibold text-text">{turn.when}</time>
      </div>

      {/* Continuous vertical timeline track + milestone node */}
      <div className="relative flex justify-center">
        {!isFirst && <span aria-hidden className="absolute top-0 h-[15px] w-px bg-grey-02" />}
        {!isLast && <span aria-hidden className="absolute top-[15px] bottom-0 w-px bg-grey-02" />}
        <span
          aria-hidden
          className="relative z-10 mt-[6px] inline-grid size-[18px] shrink-0 place-items-center rounded-full border border-grey-02 bg-white"
        >
          <span className={cx('size-2 rounded-full', turn.isKey ? 'bg-text' : 'bg-grey-03')} />
        </span>
      </div>

      {/* Turn body */}
      <article className={cx('flex min-w-0 flex-col gap-3 pb-7', isLast && 'pb-2')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <time className="text-[14px] font-semibold text-text @[640px]:hidden">{turn.when}</time>
            {turn.isKey && <TemplateBadge tone="neutral">Key turn</TemplateBadge>}
          </div>
          {turn.sourceLabel && <span className="text-[13.5px] text-grey-04">{turn.sourceLabel}</span>}
        </div>

        {turn.href ? (
          <Link href={turn.href} className="text-text no-underline hover:text-[#4c1fd4]">
            {titleNode}
          </Link>
        ) : turn.onSelect ? (
          <button
            type="button"
            onClick={turn.onSelect}
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-text hover:text-[#4c1fd4]"
          >
            {titleNode}
          </button>
        ) : (
          titleNode
        )}

        <p className="m-0 text-[15px] leading-[23px] text-text/85">{turn.why}</p>

        {/* Known / Disputed / Unknown structured breakdown */}
        {turn.knownDisputedUnknown && (
          <dl className={cx('m-0 grid grid-cols-1 gap-4 p-4 @[600px]:grid-cols-3', TEMPLATE_CARD_SURFACE)}>
            <div className="flex flex-col gap-1">
              <dt className="text-[13.5px] font-semibold text-text">Known</dt>
              <dd className="m-0 text-[14.5px] leading-[21px] text-text/85">{turn.knownDisputedUnknown.known}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-[13.5px] font-semibold text-purple">Disputed</dt>
              <dd className="m-0 text-[14.5px] leading-[21px] text-text/85">{turn.knownDisputedUnknown.disputed}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-[13.5px] font-semibold text-grey-04">Unknown</dt>
              <dd className="m-0 text-[14.5px] leading-[21px] text-text/85">{turn.knownDisputedUnknown.unknown}</dd>
            </div>
          </dl>
        )}

        {/* Side-by-side community framings */}
        {showFramings && turn.communityFramings && turn.communityFramings.length > 0 && (
          <div className="grid grid-cols-1 gap-3 pt-1 @[600px]:grid-cols-2">
            {turn.communityFramings.map(framing => (
              <div
                key={framing.communityId}
                className={cx('relative flex flex-col gap-1.5 overflow-hidden p-4', TEMPLATE_CARD_SURFACE)}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2.5px]"
                  style={{ backgroundColor: framing.color }}
                />
                <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-text">
                  <span
                    aria-hidden
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: framing.color }}
                  />
                  {framing.communityName}
                </span>
                <p className="m-0 text-[14.5px] leading-[21px] text-text/85">{framing.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Linked claims & open event */}
        {((turn.claims && turn.claims.length > 0) || turn.onSelect || turn.href) && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
            <div className="flex flex-wrap gap-2">
              {turn.claims?.map(claim =>
                claim.href ? (
                  <Link
                    key={claim.id}
                    href={claim.href}
                    className="inline-flex items-center rounded-full border border-black/[0.06] bg-white px-3 py-1 text-[13.5px] font-medium text-text no-underline shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-colors hover:border-text hover:text-[#4c1fd4]"
                  >
                    {claim.title}
                  </Link>
                ) : (
                  <button
                    key={claim.id}
                    type="button"
                    onClick={claim.onSelect}
                    className="inline-flex cursor-pointer items-center rounded-full border border-black/[0.06] bg-white px-3 py-1 text-[13.5px] font-medium text-text shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-colors hover:border-text hover:text-[#4c1fd4]"
                  >
                    {claim.title}
                  </button>
                )
              )}
            </div>

            {turn.onSelect && (
              <button
                type="button"
                onClick={turn.onSelect}
                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <span>Event page</span>
                <ArrowRightIcon className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
