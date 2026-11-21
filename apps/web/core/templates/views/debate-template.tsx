'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { DebateTemplateModel } from '../models';
import {
  ArrowRightIcon,
  PlayIcon,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  VoteBox,
} from '../primitives';

export interface DebateTemplateProps {
  model: DebateTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function formatDelta(points: number): string {
  if (points > 0) return `+${points} pts`;
  if (points < 0) return `−${Math.abs(points)} pts`;
  return '0 pts';
}

/**
 * Pure, data-driven Debate page template.
 *
 * Displays timed-turn debate stage, debater cards, Claim `VoteBox`, "How the vote moved"
 * before/after community shift table, and related debates on the same claim.
 */
export function DebateTemplate({ model, headerActions, footer, className }: DebateTemplateProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);

  return (
    <TemplateShell maxWidth={860} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TemplateBadge tone="debate">Debate</TemplateBadge>
            {model.date && <TemplateBadge tone="neutral">{model.date}</TemplateBadge>}
            {model.duration && <TemplateBadge tone="neutral">{model.duration}</TemplateBadge>}
            {model.voteCountLabel && <TemplateBadge tone="neutral">{model.voteCountLabel}</TemplateBadge>}
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-largeTitle text-pretty text-text">{model.claimTitle}</h1>

        {model.summary && <p className="m-0 text-[16.5px] leading-[25px] text-text/85">{model.summary}</p>}

        {(model.claimHref || model.onOpenClaim) && (
          <div>
            {model.claimHref ? (
              <Link
                href={model.claimHref}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>See full claim breakdown</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={model.onOpenClaim}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <span>See full claim breakdown</span>
                <ArrowRightIcon className="size-4" />
              </button>
            )}
          </div>
        )}
      </header>

      {/* Video stage card */}
      <section aria-label="Debate recording" className={cx('overflow-hidden', TEMPLATE_CARD_SURFACE)}>
        <div className="relative flex aspect-[16/8.2] flex-col items-center justify-center gap-4 bg-text px-6 py-8 text-white">
          <div className="flex items-center gap-6">
            {model.participants.map(person => (
              <div key={person.name} className="flex flex-col items-center gap-2">
                <div
                  className="grid size-16 place-items-center rounded-full border-2 text-[19px] font-semibold text-white @[520px]:size-20"
                  style={{ borderColor: person.communityColor, backgroundColor: '#2d2d30' }}
                >
                  {initialsFor(person.name)}
                </div>
                <span className="text-[14px] font-medium text-white/90">{person.name}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={isPlaying}
            onClick={() => setIsPlaying(prev => !prev)}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-white/25 bg-white px-5 text-[15px] font-semibold text-text transition-opacity hover:opacity-90"
          >
            <PlayIcon className="size-4" />
            <span>
              {isPlaying ? 'Pause debate preview' : `Watch debate${model.duration ? ` · ${model.duration}` : ''}`}
            </span>
          </button>

          {isPlaying && (
            <div className="flex w-full max-w-[440px] flex-col gap-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-1/3 rounded-full bg-ctaPrimary" />
              </div>
              <span className="text-center text-[13px] text-white/75">Opening statements · timed 3-minute turns</span>
            </div>
          )}
        </div>

        {/* Debater strip */}
        {model.participants.length > 0 && (
          <div className="grid grid-cols-1 divide-y divide-divider @[560px]:grid-cols-2 @[560px]:divide-x @[560px]:divide-y-0">
            {model.participants.map(person => (
              <div key={person.name} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: person.communityColor }}
                  />
                  <div className="flex flex-col">
                    <span className="text-[16px] font-semibold text-text">{person.name}</span>
                    <span className="text-[14px] text-grey-04">{person.communityLabel}</span>
                  </div>
                </div>
                <TemplateBadge tone="neutral">{person.positionLabel}</TemplateBadge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Claim VoteBox */}
      <VoteBox
        split={{
          isSplit: true,
          rows: model.shifts
            ? model.shifts.map(shift => ({
                id: shift.label,
                label: shift.label,
                color: shift.color,
                percent: shift.afterPercent,
                isEveryone: shift.label.toLowerCase().includes('everyone'),
              }))
            : [],
        }}
        control={model.voteBox}
      />

      {/* How the vote moved */}
      {model.shifts && model.shifts.length > 0 && (
        <section
          aria-label="How the vote moved"
          className={cx('flex flex-col gap-4 p-5 @[560px]:p-6', TEMPLATE_CARD_SURFACE)}
        >
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">How the vote moved</h2>
            {model.shiftVerdict && <p className="m-0 text-[15px] leading-[22px] text-grey-04">{model.shiftVerdict}</p>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-divider text-[14px] font-medium text-grey-04">
                  <th className="py-2.5 pr-4 font-medium">Viewers</th>
                  <th className="px-3 py-2.5 text-right font-medium">Before</th>
                  <th className="px-3 py-2.5 text-right font-medium">After</th>
                  <th className="py-2.5 pl-3 text-right font-medium">Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider text-[16px]">
                {model.shifts.map(row => (
                  <tr key={row.label}>
                    <td className="py-3.5 pr-4">
                      <span className="inline-flex items-center gap-2.5 font-medium text-text">
                        <span
                          aria-hidden
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.label}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right text-grey-04 tabular-nums">{row.beforePercent}%</td>
                    <td className="px-3 py-3.5 text-right font-semibold text-text tabular-nums">{row.afterPercent}%</td>
                    <td className="py-3.5 pl-3 text-right tabular-nums">
                      <span
                        className={cx(
                          'inline-flex rounded-full px-2.5 py-0.5 text-[14px] font-semibold',
                          row.deltaPoints > 0
                            ? 'bg-ctaTertiary text-ctaPrimary'
                            : row.deltaPoints < 0
                              ? 'bg-purple-tint text-purple'
                              : 'bg-grey-01 text-grey-04'
                        )}
                      >
                        {formatDelta(row.deltaPoints)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Related debates & sections */}
      {model.sections.length > 0 && (
        <div className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {footer}
    </TemplateShell>
  );
}
