'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  CURATOR_ONBOARDING_GEO_ICON_SRC,
  CURATOR_ONBOARDING_PROGRESS_COLOR,
  CURATOR_ONBOARDING_STEPS,
} from '~/core/explore/curator-onboarding-steps';
import { useCuratorOnboardingStatus } from '~/core/hooks/use-curator-onboarding-status';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

function CuratorOnboardingStepIndicator({ complete }: { complete: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        complete ? 'border-purple bg-purple' : 'border-grey-03 bg-white'
      )}
    >
      {complete ? (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
          <path
            d="M1 4.2L3.6 6.8L9 1.4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function CuratorOnboardingPointsBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img
        src={CURATOR_ONBOARDING_GEO_ICON_SRC}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 shrink-0 object-contain"
        draggable={false}
      />
      <span className="text-[16px] leading-[17px] font-medium tracking-[-0.35px] text-purple">{points}</span>
    </span>
  );
}

export function CuratorOnboardingSection() {
  const { completion, progressPercent, isLoading, isVisible } = useCuratorOnboardingStatus();
  const [expanded, setExpanded] = React.useState(true);

  if (!isVisible) return null;

  return (
    <section className="flex flex-col rounded-lg border border-grey-02 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[24px] leading-[28px] font-semibold tracking-[-0.02em] text-text">Curator onboarding</h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse curator onboarding' : 'Expand curator onboarding'}
          onClick={() => setExpanded(prev => !prev)}
          className="mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-grey-04 transition-colors hover:text-text"
        >
          <span className={cx('transition-transform', expanded ? 'rotate-180' : 'rotate-0')}>
            <ChevronDownSmall />
          </span>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-02">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: CURATOR_ONBOARDING_PROGRESS_COLOR,
            }}
          />
        </div>
        <p className="text-[13px] leading-[13px] font-normal text-text">
          {isLoading ? 'Loading…' : `${progressPercent}% complete`}
        </p>
      </div>

      {expanded ? (
        <ul className="mt-5 flex flex-col gap-5">
          {CURATOR_ONBOARDING_STEPS.map(step => {
            const complete = completion[step.id];

            return (
              <li key={step.id} className="flex gap-3">
                <CuratorOnboardingStepIndicator complete={complete} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[16px] leading-[17px] font-medium tracking-[-0.35px] text-text">{step.title}</p>
                    <CuratorOnboardingPointsBadge points={step.points} />
                  </div>
                  <p className="mt-1 text-[16px] leading-[16px] font-normal tracking-[-0.35px] text-grey-04">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
